import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/offline/offline_queue.dart';
import '../../shared/premium_theme.dart';

class SyncStatusScreen extends StatefulWidget {
  const SyncStatusScreen({super.key, required this.apiClient, required this.offlineQueue});

  final FieldCoreApiClient apiClient;
  final OfflineQueueRepository offlineQueue;

  @override
  State<SyncStatusScreen> createState() => _SyncStatusScreenState();
}

class _SyncStatusScreenState extends State<SyncStatusScreen> {
  bool _syncing = false;
  List<Map<String, dynamic>> _lastResults = <Map<String, dynamic>>[];
  String? _error;

  Future<void> _syncNow() async {
    setState(() {
      _syncing = true;
      _error = null;
    });
    try {
      final actions = widget.offlineQueue.actions;
      final results = await widget.apiClient.pushOfflineActions(actions);
      final completedIds = results
          .where((result) => const <String>{'PROCESSED', 'DUPLICATE'}.contains(result['status']?.toString()))
          .map((result) => result['clientActionId']?.toString())
          .whereType<String>()
          .toSet();
      await widget.offlineQueue.removeByClientActionIds(completedIds);
      await widget.offlineQueue.load();
      if (!mounted) return;
      setState(() => _lastResults = results);
    } on FieldCoreApiException catch (error) {
      setState(() => _error = error.message);
    } catch (error) {
      setState(() => _error = 'Sync failed: $error');
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final actions = widget.offlineQueue.actions;
    return Scaffold(
      body: PremiumBackground(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            children: <Widget>[
              Row(
                children: <Widget>[
                  IconButton.filledTonal(onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.arrow_back), tooltip: 'Back'),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text('Sync Status', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
                        const Text('Offline queue and device registration', style: TextStyle(color: FieldCorePalette.muted)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              PremiumCard(
                glowColor: actions.isEmpty ? FieldCorePalette.success : FieldCorePalette.warning,
                child: Row(
                  children: <Widget>[
                    PremiumIconTile(icon: actions.isEmpty ? Icons.cloud_done_outlined : Icons.cloud_sync_outlined, color: actions.isEmpty ? FieldCorePalette.success : FieldCorePalette.warning),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text('${actions.length} pending action(s)', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
                          const SizedBox(height: 4),
                          Text('Device: ${widget.apiClient.deviceId ?? 'not registered'}', style: const TextStyle(color: FieldCorePalette.muted)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: _syncing || actions.isEmpty ? null : _syncNow,
                icon: _syncing
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.sync),
                label: const Text('Sync Now'),
              ),
              if (_error != null) ...<Widget>[
                const SizedBox(height: 14),
                PremiumCard(
                  glowColor: FieldCorePalette.danger,
                  child: Row(
                    children: <Widget>[
                      const Icon(Icons.error_outline, color: FieldCorePalette.danger),
                      const SizedBox(width: 10),
                      Expanded(child: Text(_error!, style: const TextStyle(color: FieldCorePalette.text))),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 22),
              Text('Pending queue', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 10),
              if (actions.isEmpty)
                const PremiumCard(
                  child: Text('No queued actions. You are fully synced.', style: TextStyle(color: FieldCorePalette.muted)),
                )
              else
                ...actions.map(
                  (action) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: PremiumCard(
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        children: <Widget>[
                          const PremiumIconTile(icon: Icons.pending_actions_outlined, color: FieldCorePalette.warning),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Text(action.actionType, style: const TextStyle(fontWeight: FontWeight.w900)),
                                const SizedBox(height: 4),
                                Text(action.clientActionId, style: const TextStyle(color: FieldCorePalette.muted, fontSize: 12)),
                              ],
                            ),
                          ),
                          Text(_time(action.queuedAt), style: const TextStyle(color: FieldCorePalette.muted, fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 22),
              Text('Last sync results', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 10),
              if (_lastResults.isEmpty)
                const PremiumCard(child: Text('No sync results yet.', style: TextStyle(color: FieldCorePalette.muted)))
              else
                ..._lastResults.map(
                  (result) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: PremiumCard(
                      padding: const EdgeInsets.all(14),
                      child: ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.fact_check_outlined, color: FieldCorePalette.primaryBright),
                        title: Text('${result['actionType'] ?? 'Action'} — ${result['status'] ?? 'UNKNOWN'}'),
                        subtitle: Text((result['error'] ?? result['message'] ?? result['clientActionId'] ?? '').toString(), style: const TextStyle(color: FieldCorePalette.muted)),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  String _time(DateTime value) => '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
}
