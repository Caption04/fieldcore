import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/models/fieldcore_job.dart';
import '../../core/offline/offline_queue.dart';
import '../../shared/status_pill.dart';
import '../checklists/checklist_screen.dart';
import '../signature/signature_screen.dart';

class JobDetailScreen extends StatefulWidget {
  const JobDetailScreen({
    super.key,
    required this.apiClient,
    required this.offlineQueue,
    required this.job,
  });

  final FieldCoreApiClient apiClient;
  final OfflineQueueRepository offlineQueue;
  final FieldCoreJob job;

  @override
  State<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<JobDetailScreen> {
  bool _saving = false;

  Future<void> _queueJobAction(String type, {Map<String, dynamic> extra = const <String, dynamic>{}}) async {
    setState(() => _saving = true);
    await widget.offlineQueue.enqueue(
      actionType: type,
      snapshotUpdatedAt: widget.job.updatedAt,
      payload: <String, dynamic>{
        'jobId': widget.job.id,
        'capturedAt': DateTime.now().toIso8601String(),
        ...extra,
      },
    );
    if (!mounted) return;
    setState(() => _saving = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$type queued for sync')));
  }

  Future<void> _queueProofPhoto() async {
    final controller = TextEditingController(text: 'local://proof/${DateTime.now().millisecondsSinceEpoch}.jpg');
    final captionController = TextEditingController();
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Queue proof photo'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            TextField(controller: controller, decoration: const InputDecoration(labelText: 'Local path or uploaded URL')),
            TextField(controller: captionController, decoration: const InputDecoration(labelText: 'Caption')),
          ],
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, <String, String>{'url': controller.text, 'caption': captionController.text}), child: const Text('Queue')),
        ],
      ),
    );
    controller.dispose();
    captionController.dispose();
    if (result == null || result['url']!.trim().isEmpty) return;
    await _queueJobAction('PROOF_PHOTO_UPLOADED', extra: <String, dynamic>{
      'url': result['url']!.trim(),
      'filename': result['url']!.split('/').last,
      'mimeType': 'image/jpeg',
      'sizeBytes': 0,
      'caption': result['caption'],
      'category': 'GENERAL',
    });
  }

  Future<void> _queuePartsUsed() async {
    final itemController = TextEditingController();
    final qtyController = TextEditingController(text: '1');
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Queue parts used'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            TextField(controller: itemController, decoration: const InputDecoration(labelText: 'Inventory item ID')),
            TextField(controller: qtyController, decoration: const InputDecoration(labelText: 'Quantity'), keyboardType: TextInputType.number),
          ],
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, <String, String>{'itemId': itemController.text, 'quantity': qtyController.text}), child: const Text('Queue')),
        ],
      ),
    );
    itemController.dispose();
    qtyController.dispose();
    if (result == null || result['itemId']!.trim().isEmpty) return;
    await _queueJobAction('PART_USED', extra: <String, dynamic>{
      'inventoryItemId': result['itemId']!.trim(),
      'quantity': num.tryParse(result['quantity'] ?? '1') ?? 1,
    });
  }

  Future<void> _openChecklist() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => ChecklistScreen(offlineQueue: widget.offlineQueue, job: widget.job),
    ));
    if (mounted) setState(() {});
  }

  Future<void> _openSignature() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => SignatureScreen(offlineQueue: widget.offlineQueue, job: widget.job),
    ));
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(widget.job.title), actions: <Widget>[Padding(padding: const EdgeInsets.only(right: 12), child: Center(child: StatusPill(label: widget.job.status))) ]),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Text(widget.job.customerName ?? 'Customer not shown', style: textTheme.titleLarge),
          if (widget.job.serviceName != null) Text(widget.job.serviceName!),
          if (widget.job.address != null) Text(widget.job.address!),
          const SizedBox(height: 16),
          Text('Queue actions offline. Sync when signal is available.', style: textTheme.bodyMedium),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: <Widget>[
              FilledButton.icon(onPressed: _saving ? null : () => _queueJobAction('JOB_START'), icon: const Icon(Icons.play_arrow), label: const Text('Start')),
              OutlinedButton.icon(onPressed: _saving ? null : () => _queueJobAction('JOB_PAUSE'), icon: const Icon(Icons.pause), label: const Text('Pause')),
              OutlinedButton.icon(onPressed: _saving ? null : () => _queueJobAction('JOB_RESUME'), icon: const Icon(Icons.restart_alt), label: const Text('Resume')),
              FilledButton.icon(onPressed: _saving ? null : () => _queueJobAction('JOB_COMPLETE'), icon: const Icon(Icons.check), label: const Text('Complete')),
            ],
          ),
          const SizedBox(height: 24),
          Card(
            child: Column(
              children: <Widget>[
                ListTile(leading: const Icon(Icons.checklist), title: const Text('Checklist'), subtitle: const Text('Answer required questions and queue completion'), onTap: _openChecklist),
                const Divider(height: 1),
                ListTile(leading: const Icon(Icons.photo_camera), title: const Text('Proof photo'), subtitle: const Text('Queue proof metadata for later upload/sync'), onTap: _queueProofPhoto),
                const Divider(height: 1),
                ListTile(leading: const Icon(Icons.draw), title: const Text('Customer signature'), subtitle: const Text('Capture signer name and signature placeholder'), onTap: _openSignature),
                const Divider(height: 1),
                ListTile(leading: const Icon(Icons.inventory_2), title: const Text('Parts used'), subtitle: const Text('Queue inventory item consumption'), onTap: _queuePartsUsed),
                const Divider(height: 1),
                ListTile(leading: const Icon(Icons.report_problem), title: const Text('Customer unavailable'), subtitle: const Text('Queue unavailable status note'), onTap: () => _queueJobAction('CUSTOMER_UNAVAILABLE')),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text('Pending offline actions: ${widget.offlineQueue.count}'),
        ],
      ),
    );
  }
}
