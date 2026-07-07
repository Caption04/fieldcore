import 'package:flutter/material.dart';

import '../../core/models/fieldcore_job.dart';
import '../../core/offline/offline_queue.dart';

class ChecklistScreen extends StatefulWidget {
  const ChecklistScreen({super.key, required this.offlineQueue, required this.job});

  final OfflineQueueRepository offlineQueue;
  final FieldCoreJob job;

  @override
  State<ChecklistScreen> createState() => _ChecklistScreenState();
}

class _ChecklistScreenState extends State<ChecklistScreen> {
  final List<_ChecklistAnswer> _answers = <_ChecklistAnswer>[
    _ChecklistAnswer(label: 'Arrived at correct site'),
    _ChecklistAnswer(label: 'Before photos captured'),
    _ChecklistAnswer(label: 'Safety check completed'),
    _ChecklistAnswer(label: 'Customer informed before leaving'),
  ];
  final _noteController = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _queueChecklist() async {
    setState(() => _saving = true);
    await widget.offlineQueue.enqueue(
      actionType: 'CHECKLIST_COMPLETED',
      snapshotUpdatedAt: widget.job.updatedAt,
      payload: <String, dynamic>{
        'jobId': widget.job.id,
        'templateId': widget.job.raw['checklistTemplateId'] ?? 'mobile-default-checklist',
        'note': _noteController.text.trim(),
        'answers': _answers
            .map((answer) => <String, dynamic>{
                  'itemId': answer.label.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-'),
                  'answer': answer.checked ? 'Yes' : 'No',
                  'passed': answer.checked,
                  'note': answer.note,
                })
            .toList(),
      },
    );
    if (!mounted) return;
    setState(() => _saving = false);
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Checklist queued for sync')));
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Checklist')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Text(widget.job.title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          ..._answers.map((answer) => CheckboxListTile(
                value: answer.checked,
                title: Text(answer.label),
                subtitle: answer.note.isEmpty ? null : Text(answer.note),
                onChanged: (value) => setState(() => answer.checked = value ?? false),
              )),
          TextField(
            controller: _noteController,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(labelText: 'Technician notes', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(onPressed: _saving ? null : _queueChecklist, icon: const Icon(Icons.save), label: const Text('Queue checklist')),
        ],
      ),
    );
  }
}

class _ChecklistAnswer {
  _ChecklistAnswer({required this.label});

  final String label;
  bool checked = false;
  String note = '';
}
