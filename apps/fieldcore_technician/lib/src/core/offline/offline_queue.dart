import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class OfflineAction {
  const OfflineAction({
    required this.clientActionId,
    required this.idempotencyKey,
    required this.actionType,
    required this.payload,
    required this.queuedAt,
    this.snapshotUpdatedAt,
  });

  final String clientActionId;
  final String idempotencyKey;
  final String actionType;
  final Map<String, dynamic> payload;
  final DateTime queuedAt;
  final DateTime? snapshotUpdatedAt;

  Map<String, dynamic> toSyncJson() => <String, dynamic>{
        'clientActionId': clientActionId,
        'idempotencyKey': idempotencyKey,
        'actionType': actionType,
        if (snapshotUpdatedAt != null) 'snapshotUpdatedAt': snapshotUpdatedAt!.toIso8601String(),
        'payload': payload,
      };

  Map<String, dynamic> toJson() => <String, dynamic>{
        ...toSyncJson(),
        'queuedAt': queuedAt.toIso8601String(),
      };

  factory OfflineAction.fromJson(Map<String, dynamic> json) {
    return OfflineAction(
      clientActionId: json['clientActionId']?.toString() ?? _newId('local'),
      idempotencyKey: json['idempotencyKey']?.toString() ?? _newId('sync'),
      actionType: json['actionType']?.toString() ?? 'JOB_NOTE',
      payload: _map(json['payload']),
      queuedAt: DateTime.tryParse(json['queuedAt']?.toString() ?? '') ?? DateTime.now(),
      snapshotUpdatedAt: DateTime.tryParse(json['snapshotUpdatedAt']?.toString() ?? ''),
    );
  }

  static Map<String, dynamic> _map(Object? value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return value.map((key, value) => MapEntry(key.toString(), value));
    return <String, dynamic>{};
  }
}

class OfflineQueueRepository {
  static const _storageKey = 'fieldcore.offline.queue.v1';

  final List<OfflineAction> _actions = <OfflineAction>[];

  List<OfflineAction> get actions => List.unmodifiable(_actions);
  int get count => _actions.length;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_storageKey);
    _actions.clear();
    if (raw == null || raw.isEmpty) return;
    final decoded = jsonDecode(raw);
    if (decoded is! List) return;
    _actions.addAll(decoded.whereType<Map>().map((item) => OfflineAction.fromJson(item.cast<String, dynamic>())));
  }

  Future<OfflineAction> enqueue({
    required String actionType,
    required Map<String, dynamic> payload,
    DateTime? snapshotUpdatedAt,
  }) async {
    final action = OfflineAction(
      clientActionId: _newId('local'),
      idempotencyKey: _newId('sync'),
      actionType: actionType,
      payload: payload,
      snapshotUpdatedAt: snapshotUpdatedAt,
      queuedAt: DateTime.now(),
    );
    _actions.add(action);
    await _save();
    return action;
  }

  Future<void> removeByClientActionIds(Set<String> ids) async {
    _actions.removeWhere((action) => ids.contains(action.clientActionId));
    await _save();
  }

  Future<void> clear() async {
    _actions.clear();
    await _save();
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_storageKey, jsonEncode(_actions.map((action) => action.toJson()).toList()));
  }
}

String _newId(String prefix) => '$prefix-${DateTime.now().microsecondsSinceEpoch}';
