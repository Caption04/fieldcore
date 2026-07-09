import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/models/fieldcore_job.dart';
import '../../core/offline/offline_queue.dart';
import '../../shared/premium_theme.dart';
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
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${_friendlyAction(type)} queued for sync')));
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
            const SizedBox(height: 12),
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
            const SizedBox(height: 12),
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
    final description = _firstText(<String>['description', 'notes', 'summary']);
    return Scaffold(
      body: PremiumBackground(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            children: <Widget>[
              _TopBar(job: widget.job),
              const SizedBox(height: 18),
              _HeroCard(job: widget.job),
              const SizedBox(height: 14),
              _CustomerCard(job: widget.job),
              const SizedBox(height: 14),
              _InfoCard(job: widget.job),
              if (description != null) ...<Widget>[
                const SizedBox(height: 14),
                PremiumCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const _SectionLabel(icon: Icons.notes_outlined, label: 'Description'),
                      const SizedBox(height: 10),
                      Text(description, style: const TextStyle(color: FieldCorePalette.muted, height: 1.45)),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 14),
              _ProgressCard(pendingActions: widget.offlineQueue.count),
              const SizedBox(height: 16),
              _PrimaryActions(saving: _saving, onQueue: _queueJobAction),
              const SizedBox(height: 18),
              _ActionMenu(
                onChecklist: _openChecklist,
                onProofPhoto: _queueProofPhoto,
                onSignature: _openSignature,
                onPartsUsed: _queuePartsUsed,
                onCustomerUnavailable: () => _queueJobAction('CUSTOMER_UNAVAILABLE'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String? _firstText(List<String> keys) {
    for (final key in keys) {
      final value = widget.job.raw[key]?.toString().trim();
      if (value != null && value.isNotEmpty && value != 'null') return value;
    }
    return null;
  }

  String _friendlyAction(String type) => type.replaceAll('_', ' ').toLowerCase();
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.job});

  final FieldCoreJob job;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        IconButton.filledTonal(onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.arrow_back), tooltip: 'Back'),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(job.id.isEmpty ? 'Job Details' : job.id, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
              Text('Job Details', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: FieldCorePalette.muted)),
            ],
          ),
        ),
        StatusPill(label: job.status),
      ],
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.job});

  final FieldCoreJob job;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      glowColor: FieldCorePalette.primary,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const PremiumIconTile(icon: Icons.work_outline, color: FieldCorePalette.primaryBright),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(job.title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900, letterSpacing: -0.4)),
                if ((job.serviceName ?? '').isNotEmpty) ...<Widget>[
                  const SizedBox(height: 6),
                  Text(job.serviceName!, style: const TextStyle(color: FieldCorePalette.primaryBright, fontWeight: FontWeight.w700)),
                ],
                if ((job.address ?? '').isNotEmpty) ...<Widget>[
                  const SizedBox(height: 10),
                  _MetaLine(icon: Icons.place_outlined, text: job.address!),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CustomerCard extends StatelessWidget {
  const _CustomerCard({required this.job});

  final FieldCoreJob job;

  @override
  Widget build(BuildContext context) {
    final phone = _phone;
    return PremiumCard(
      child: Row(
        children: <Widget>[
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(colors: <Color>[FieldCorePalette.primaryBright, FieldCorePalette.primary]),
              boxShadow: <BoxShadow>[BoxShadow(color: FieldCorePalette.primary.withValues(alpha: 0.28), blurRadius: 22)],
            ),
            child: Center(
              child: Text(_initials(job.customerName ?? 'Customer'), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(job.customerName ?? 'Customer not shown', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                const SizedBox(height: 4),
                Text(phone ?? 'Contact number unavailable', style: const TextStyle(color: FieldCorePalette.muted)),
              ],
            ),
          ),
          const IconButton.filledTonal(onPressed: null, icon: Icon(Icons.call_outlined), tooltip: 'Call'),
        ],
      ),
    );
  }

  String? get _phone {
    for (final key in <String>['customerPhone', 'phone', 'contactPhone', 'phoneNumber']) {
      final value = job.raw[key]?.toString().trim();
      if (value != null && value.isNotEmpty && value != 'null') return value;
    }
    final customer = job.raw['customer'];
    if (customer is Map) {
      for (final key in <String>['phone', 'phoneNumber', 'contactPhone']) {
        final value = customer[key]?.toString().trim();
        if (value != null && value.isNotEmpty && value != 'null') return value;
      }
    }
    return null;
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((part) => part.isNotEmpty).toList();
    if (parts.isEmpty) return 'FC';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return '${parts[0].substring(0, 1)}${parts[1].substring(0, 1)}'.toUpperCase();
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.job});

  final FieldCoreJob job;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      child: Column(
        children: <Widget>[
          _InfoRow(icon: Icons.schedule, label: 'Scheduled time', value: job.scheduledStart == null ? 'Not scheduled' : _formatDate(job.scheduledStart!)),
          const SizedBox(height: 14),
          _InfoRow(icon: Icons.flag_outlined, label: 'Priority', value: _value(<String>['priority', 'urgency']) ?? 'Normal'),
          const SizedBox(height: 14),
          _InfoRow(icon: Icons.business_center_outlined, label: 'Asset / Equipment', value: _value(<String>['assetName', 'asset', 'equipment', 'unit']) ?? 'Not specified'),
        ],
      ),
    );
  }

  String? _value(List<String> keys) {
    for (final key in keys) {
      final value = job.raw[key]?.toString().trim();
      if (value != null && value.isNotEmpty && value != 'null') return value;
    }
    return null;
  }

  String _formatDate(DateTime value) {
    return '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')} • ${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Icon(icon, color: FieldCorePalette.primaryBright, size: 20),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(label, style: const TextStyle(color: FieldCorePalette.muted, fontSize: 12)),
              const SizedBox(height: 3),
              Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProgressCard extends StatelessWidget {
  const _ProgressCard({required this.pendingActions});

  final int pendingActions;

  @override
  Widget build(BuildContext context) {
    final completed = pendingActions == 0 ? 2 : 4;
    return PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              const _SectionLabel(icon: Icons.timeline, label: 'Job progress'),
              const Spacer(),
              Text('$completed of 6', style: const TextStyle(color: FieldCorePalette.muted, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: completed / 6,
              minHeight: 7,
              backgroundColor: Colors.white.withValues(alpha: 0.08),
              valueColor: const AlwaysStoppedAnimation<Color>(FieldCorePalette.primaryBright),
            ),
          ),
          const SizedBox(height: 14),
          const _ProgressStep(done: true, label: 'Check-in & safety'),
          const _ProgressStep(done: true, label: 'Inspect site'),
          _ProgressStep(done: pendingActions > 0, label: 'Work updates queued'),
          const _ProgressStep(done: false, label: 'Customer approval'),
          if (pendingActions > 0) ...<Widget>[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                color: FieldCorePalette.warning.withValues(alpha: 0.1),
                border: Border.all(color: FieldCorePalette.warning.withValues(alpha: 0.26)),
              ),
              child: Row(
                children: <Widget>[
                  const Icon(Icons.sync_problem, color: FieldCorePalette.warning, size: 18),
                  const SizedBox(width: 10),
                  Expanded(child: Text('$pendingActions offline action(s) waiting to sync.', style: const TextStyle(color: FieldCorePalette.muted))),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProgressStep extends StatelessWidget {
  const _ProgressStep({required this.done, required this.label});

  final bool done;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        children: <Widget>[
          Icon(done ? Icons.check_circle : Icons.radio_button_unchecked, color: done ? FieldCorePalette.primaryBright : FieldCorePalette.muted, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(label, style: TextStyle(color: done ? FieldCorePalette.text : FieldCorePalette.muted))),
          const Icon(Icons.chevron_right, color: FieldCorePalette.muted, size: 18),
        ],
      ),
    );
  }
}

class _PrimaryActions extends StatelessWidget {
  const _PrimaryActions({required this.saving, required this.onQueue});

  final bool saving;
  final Future<void> Function(String type) onQueue;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        Row(
          children: <Widget>[
            Expanded(
              child: FilledButton.icon(
                onPressed: saving ? null : () => onQueue('JOB_START'),
                icon: const Icon(Icons.play_arrow_rounded),
                label: const Text('Start Job'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: <Widget>[
            Expanded(child: OutlinedButton.icon(onPressed: saving ? null : () => onQueue('JOB_PAUSE'), icon: const Icon(Icons.pause), label: const Text('Pause'))),
            const SizedBox(width: 10),
            Expanded(child: OutlinedButton.icon(onPressed: saving ? null : () => onQueue('JOB_RESUME'), icon: const Icon(Icons.restart_alt), label: const Text('Resume'))),
            const SizedBox(width: 10),
            Expanded(child: FilledButton.icon(onPressed: saving ? null : () => onQueue('JOB_COMPLETE'), icon: const Icon(Icons.check), label: const Text('Complete'))),
          ],
        ),
      ],
    );
  }
}

class _ActionMenu extends StatelessWidget {
  const _ActionMenu({required this.onChecklist, required this.onProofPhoto, required this.onSignature, required this.onPartsUsed, required this.onCustomerUnavailable});

  final VoidCallback onChecklist;
  final VoidCallback onProofPhoto;
  final VoidCallback onSignature;
  final VoidCallback onPartsUsed;
  final VoidCallback onCustomerUnavailable;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: <Widget>[
          _ActionTile(icon: Icons.checklist, title: 'Checklist', subtitle: 'Answer required questions', onTap: onChecklist),
          _divider(),
          _ActionTile(icon: Icons.photo_camera_outlined, title: 'Proof photo', subtitle: 'Capture before/after evidence', onTap: onProofPhoto),
          _divider(),
          _ActionTile(icon: Icons.draw_outlined, title: 'Customer signature', subtitle: 'Capture approval on-site', onTap: onSignature),
          _divider(),
          _ActionTile(icon: Icons.inventory_2_outlined, title: 'Parts used', subtitle: 'Queue inventory consumption', onTap: onPartsUsed),
          _divider(),
          _ActionTile(icon: Icons.report_problem_outlined, title: 'Customer unavailable', subtitle: 'Queue unavailable status note', onTap: onCustomerUnavailable, color: FieldCorePalette.warning),
        ],
      ),
    );
  }

  Widget _divider() => Divider(height: 1, color: FieldCorePalette.border.withValues(alpha: 0.45));
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.icon, required this.title, required this.subtitle, required this.onTap, this.color = FieldCorePalette.primaryBright});

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
      leading: PremiumIconTile(icon: icon, color: color),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
      subtitle: Text(subtitle, style: const TextStyle(color: FieldCorePalette.muted)),
      trailing: const Icon(Icons.chevron_right, color: FieldCorePalette.muted),
      onTap: onTap,
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Icon(icon, color: FieldCorePalette.primaryBright, size: 18),
        const SizedBox(width: 8),
        Text(label, style: const TextStyle(fontWeight: FontWeight.w900)),
      ],
    );
  }
}

class _MetaLine extends StatelessWidget {
  const _MetaLine({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Icon(icon, color: FieldCorePalette.muted, size: 16),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: const TextStyle(color: FieldCorePalette.muted))),
      ],
    );
  }
}
