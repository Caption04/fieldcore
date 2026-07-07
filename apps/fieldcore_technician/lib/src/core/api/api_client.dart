import 'dart:convert';
import 'dart:io' as io;

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../../config/environment.dart';
import '../models/fieldcore_job.dart';
import '../offline/offline_queue.dart';

class FieldCoreApiException implements Exception {
  const FieldCoreApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => 'FieldCoreApiException($statusCode): $message';
}

class FieldCoreApiClient {
  FieldCoreApiClient({http.Client? httpClient}) : _httpClient = httpClient ?? http.Client();

  static const _baseUrlKey = 'fieldcore.api.baseUrl';
  static const _cookieKey = 'fieldcore.api.cookie';
  static const _deviceIdKey = 'fieldcore.device.id';

  final http.Client _httpClient;
  String _baseUrl = FieldCoreEnvironment.defaultApiBaseUrl;
  String? _cookie;
  String? _deviceId;

  String get baseUrl => _baseUrl;
  String? get deviceId => _deviceId;
  bool get hasSession => _cookie != null && _cookie!.isNotEmpty;

  Future<void> loadSession() async {
    final prefs = await SharedPreferences.getInstance();
    _baseUrl = prefs.getString(_baseUrlKey) ?? FieldCoreEnvironment.defaultApiBaseUrl;
    _cookie = prefs.getString(_cookieKey);
    _deviceId = prefs.getString(_deviceIdKey);
  }

  Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_cookieKey);
    _cookie = null;
  }

  Future<void> saveBaseUrl(String value) async {
    final sanitized = value.trim().replaceAll(RegExp(r'/+$'), '');
    if (sanitized.isEmpty) throw const FieldCoreApiException('API base URL is required');
    final prefs = await SharedPreferences.getInstance();
    _baseUrl = sanitized;
    await prefs.setString(_baseUrlKey, sanitized);
  }

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
    required String apiBaseUrl,
  }) async {
    await saveBaseUrl(apiBaseUrl);
    final response = await _post('/api/auth/login', <String, dynamic>{
      'email': email,
      'password': password,
    }, includeCookie: false);
    final setCookie = response.headers['set-cookie'];
    if (setCookie != null && setCookie.isNotEmpty) {
      _cookie = setCookie.split(';').first;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cookieKey, _cookie!);
    }
    await registerDevice();
    return _decodeData(response);
  }

  Future<Map<String, dynamic>> registerDevice() async {
    _deviceId ??= 'fieldcore-install-${DateTime.now().microsecondsSinceEpoch}';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_deviceIdKey, _deviceId!);

    final response = await _post('/api/worker/devices/register', <String, dynamic>{
      'platform': _platformName(),
      'deviceId': _deviceId,
      'deviceName': 'FieldCore Technician',
      'deviceModel': _deviceModel(),
      'appVersion': FieldCoreEnvironment.appVersion,
    });
    return _decodeData(response);
  }

  Future<Map<String, dynamic>> getMobileConfig() async {
    final response = await _get('/api/worker/mobile/config');
    return _decodeData(response);
  }

  Future<List<FieldCoreJob>> pullJobs({DateTime? since}) async {
    final device = _requireDevice();
    final params = <String, String>{'deviceId': device};
    if (since != null) params['since'] = since.toIso8601String();
    final uri = Uri.parse('$_baseUrl/api/worker/sync/v2/pull').replace(queryParameters: params);
    final response = await _httpClient.get(uri, headers: _headers());
    final data = _decodeData(response);
    final jobs = data['jobs'];
    if (jobs is! List) return <FieldCoreJob>[];
    return jobs.whereType<Map>().map((job) => FieldCoreJob.fromJson(job.cast<String, dynamic>())).toList();
  }

  Future<List<Map<String, dynamic>>> pushOfflineActions(List<OfflineAction> actions) async {
    if (actions.isEmpty) return <Map<String, dynamic>>[];
    final response = await _post('/api/worker/sync/v2/push', <String, dynamic>{
      'deviceId': _requireDevice(),
      'actions': actions.map((action) => action.toSyncJson()).toList(),
    });
    final data = _decodeData(response);
    final results = data['results'];
    if (results is! List) return <Map<String, dynamic>>[];
    return results.whereType<Map>().map((item) => item.cast<String, dynamic>()).toList();
  }

  Future<http.Response> _get(String path) {
    return _httpClient.get(Uri.parse('$_baseUrl$path'), headers: _headers());
  }

  Future<http.Response> _post(String path, Map<String, dynamic> body, {bool includeCookie = true}) {
    return _httpClient.post(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(includeCookie: includeCookie),
      body: jsonEncode(body),
    );
  }

  Map<String, String> _headers({bool includeCookie = true}) {
    return <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (includeCookie && _cookie != null) 'Cookie': _cookie!,
    };
  }

  Map<String, dynamic> _decodeData(http.Response response) {
    final decoded = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);
    final payload = decoded is Map ? decoded.cast<String, dynamic>() : <String, dynamic>{};
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = payload['error'];
      final message = error is Map ? error['message']?.toString() : payload['message']?.toString();
      throw FieldCoreApiException(message ?? 'Request failed', statusCode: response.statusCode);
    }
    final data = payload['data'];
    if (data is Map) return data.cast<String, dynamic>();
    return payload;
  }

  String _requireDevice() {
    final value = _deviceId;
    if (value == null || value.isEmpty) throw const FieldCoreApiException('Device is not registered');
    return value;
  }

  String _platformName() {
    if (kIsWeb) return 'WEB';
    if (io.Platform.isAndroid) return 'ANDROID';
    if (io.Platform.isIOS) return 'IOS';
    return 'UNKNOWN';
  }

  String _deviceModel() {
    if (kIsWeb) return 'web';
    return io.Platform.operatingSystemVersion;
  }
}
