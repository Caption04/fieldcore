import 'package:flutter/material.dart';

import '../../core/models/fieldcore_job.dart';
import '../../core/offline/offline_queue.dart';
import '../../shared/premium_theme.dart';

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
    final completed = _answers.where((answer) => answer.checked).length;
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
                        Text('Checklist', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
                        Text(widget.job.title, style: const TextStyle(color: FieldCorePalette.muted)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              PremiumCard(
                glowColor: FieldCorePalette.primaryBright,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        const PremiumIconTile(icon: Icons.checklist, color: FieldCorePalette.primaryBright),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Text('$completed of ${_answers.length} completed', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                              const SizedBox(height: 4),
                              const Text('Complete the on-site quality checks.', style: TextStyle(color: FieldCorePalette.muted)),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        value: completed / _answers.length,
                        minHeight: 7,
                        backgroundColor: Colors.white.withValues(alpha: 0.08),
                        valueColor: const AlwaysStoppedAnimation<Color>(FieldCorePalette.primaryBright),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              ..._answers.map(
                (answer) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: PremiumCard(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    glowColor: answer.checked ? FieldCorePalette.success : null,
                    child: CheckboxListTile(
                      value: answer.checked,
                      contentPadding: EdgeInsets.zero,
                      controlAffinity: ListTileControlAffinity.leading,
                      activeColor: FieldCorePalette.success,
                      title: Text(answer.label, style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: answer.note.isEmpty ? null : Text(answer.note, style: const TextStyle(color: FieldCorePalette.muted)),
                      onChanged: (value) => setState(() => answer.checked = value ?? false),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              PremiumCard(
                child: TextField(
                  controller: _noteController,
                  minLines: 3,
                  maxLines: 5,
                  decoration: const InputDecoration(
                    labelText: 'Technician notes',
                    alignLabelWithHint: true,
                    prefixIcon: Icon(Icons.notes_outlined),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: _saving ? null : _queueChecklist,
                icon: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.save_outlined),
                label: const Text('Queue Checklist'),
              ),
            ],
          ),
        ),
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
