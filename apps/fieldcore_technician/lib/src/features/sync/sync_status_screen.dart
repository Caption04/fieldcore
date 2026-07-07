import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/offline/offline_queue.dart';

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
      appBar: AppBar(title: const Text('Sync status')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Card(
            child: ListTile(
              leading: const Icon(Icons.cloud_sync),
              title: Text('${actions.length} pending action(s)'),
              subtitle: Text('Device: ${widget.apiClient.deviceId ?? 'not registered'}'),
              trailing: FilledButton.icon(onPressed: _syncing || actions.isEmpty ? null : _syncNow, icon: const Icon(Icons.sync), label: const Text('Sync now')),
            ),
          ),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          const SizedBox(height: 16),
          Text('Pending queue', style: Theme.of(context).textTheme.titleMedium),
          if (actions.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('No queued actions.')),
          ...actions.map((action) => ListTile(
                title: Text(action.actionType),
                subtitle: Text(action.clientActionId),
                trailing: Text('${action.queuedAt.hour.toString().padLeft(2, '0')}:${action.queuedAt.minute.toString().padLeft(2, '0')}'),
              )),
          const SizedBox(height: 16),
          Text('Last sync results', style: Theme.of(context).textTheme.titleMedium),
          if (_lastResults.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('No sync results yet.')),
          ..._lastResults.map((result) => ListTile(
                title: Text('${result['actionType'] ?? 'Action'} — ${result['status'] ?? 'UNKNOWN'}'),
                subtitle: Text((result['error'] ?? result['message'] ?? result['clientActionId'] ?? '').toString()),
              )),
        ],
      ),
    );
  }
}
