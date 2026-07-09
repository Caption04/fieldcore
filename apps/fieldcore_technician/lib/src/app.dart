import 'package:flutter/material.dart';

import 'core/api/api_client.dart';
import 'core/offline/offline_queue.dart';
import 'features/auth/login_screen.dart';
import 'features/jobs/jobs_screen.dart';
import 'shared/premium_theme.dart';

class FieldCoreTechnicianApp extends StatefulWidget {
  const FieldCoreTechnicianApp({super.key});

  @override
  State<FieldCoreTechnicianApp> createState() => _FieldCoreTechnicianAppState();
}

class _FieldCoreTechnicianAppState extends State<FieldCoreTechnicianApp> {
  late final FieldCoreApiClient apiClient;
  late final OfflineQueueRepository offlineQueue;
  bool _ready = false;
  bool _authenticated = false;

  @override
  void initState() {
    super.initState();
    apiClient = FieldCoreApiClient();
    offlineQueue = OfflineQueueRepository();
    _load();
  }

  Future<void> _load() async {
    await apiClient.loadSession();
    await offlineQueue.load();
    if (!mounted) return;
    setState(() {
      _authenticated = apiClient.hasSession;
      _ready = true;
    });
  }

  Future<void> _onAuthenticated() async {
    await apiClient.loadSession();
    if (!mounted) return;
    setState(() => _authenticated = apiClient.hasSession);
  }

  Future<void> _logout() async {
    await apiClient.clearSession();
    if (!mounted) return;
    setState(() => _authenticated = false);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FieldCore Technician',
      debugShowCheckedModeBanner: false,
      theme: FieldCorePremiumTheme.theme,
      home: !_ready
          ? const _LoadingScreen()
          : _authenticated
              ? JobsScreen(
                  apiClient: apiClient,
                  offlineQueue: offlineQueue,
                  onLogout: _logout,
                )
              : LoginScreen(
                  apiClient: apiClient,
                  onAuthenticated: _onAuthenticated,
                ),
    );
  }
}

class _LoadingScreen extends StatelessWidget {
  const _LoadingScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: PremiumBackground(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              FieldCoreMark(size: 64),
              SizedBox(height: 22),
              CircularProgressIndicator(),
            ],
          ),
        ),
      ),
    );
  }
}
