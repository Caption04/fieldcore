import 'package:flutter/material.dart';

import '../../core/models/fieldcore_job.dart';
import '../../core/offline/offline_queue.dart';
import '../../shared/premium_theme.dart';

class SignatureScreen extends StatefulWidget {
  const SignatureScreen({super.key, required this.offlineQueue, required this.job});

  final OfflineQueueRepository offlineQueue;
  final FieldCoreJob job;

  @override
  State<SignatureScreen> createState() => _SignatureScreenState();
}

class _SignatureScreenState extends State<SignatureScreen> {
  final _signerController = TextEditingController();
  final List<Offset?> _points = <Offset?>[];
  bool _saving = false;

  @override
  void dispose() {
    _signerController.dispose();
    super.dispose();
  }

  Future<void> _queueSignature() async {
    if (_signerController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Signer name is required')));
      return;
    }
    setState(() => _saving = true);
    await widget.offlineQueue.enqueue(
      actionType: 'SIGNATURE_CAPTURED',
      snapshotUpdatedAt: widget.job.updatedAt,
      payload: <String, dynamic>{
        'jobId': widget.job.id,
        'signerName': _signerController.text.trim(),
        'signatureUrl': 'local://signature/${DateTime.now().millisecondsSinceEpoch}.png',
        'mimeType': 'image/png',
        'sizeBytes': 0,
        'capturedAt': DateTime.now().toIso8601String(),
      },
    );
    if (!mounted) return;
    setState(() => _saving = false);
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Signature queued for sync')));
    Navigator.pop(context);
  }

  void _addPoint(DragUpdateDetails details) {
    final box = context.findRenderObject() as RenderBox?;
    if (box == null) return;
    setState(() => _points.add(box.globalToLocal(details.globalPosition)));
  }

  @override
  Widget build(BuildContext context) {
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
                        Text('Customer Signature', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
                        Text(widget.job.title, style: const TextStyle(color: FieldCorePalette.muted)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              PremiumCard(
                glowColor: FieldCorePalette.primary,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        const PremiumIconTile(icon: Icons.draw_outlined, color: FieldCorePalette.primaryBright),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Text('On-site approval', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                              const SizedBox(height: 4),
                              const Text('Capture the signer name and handwritten approval.', style: TextStyle(color: FieldCorePalette.muted)),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    TextField(
                      controller: _signerController,
                      decoration: const InputDecoration(labelText: 'Signer name', prefixIcon: Icon(Icons.person_outline)),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: <Widget>[
                        const Text('Customer Signature', style: TextStyle(fontWeight: FontWeight.w900)),
                        const Spacer(),
                        TextButton.icon(
                          onPressed: () => setState(_points.clear),
                          icon: const Icon(Icons.delete_outline, size: 18),
                          label: const Text('Clear'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Container(
                      height: 250,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(20),
                        color: const Color(0xFFF7FAFF),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.65), width: 2),
                        boxShadow: <BoxShadow>[
                          BoxShadow(color: FieldCorePalette.primary.withValues(alpha: 0.16), blurRadius: 26, offset: const Offset(0, 12)),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(18),
                        child: GestureDetector(
                          onPanUpdate: _addPoint,
                          onPanEnd: (_) => setState(() => _points.add(null)),
                          child: CustomPaint(
                            painter: _SignaturePainter(_points),
                            child: Center(
                              child: _points.isEmpty
                                  ? Text('Sign here', style: TextStyle(color: FieldCorePalette.midnight.withValues(alpha: 0.36), fontWeight: FontWeight.w700))
                                  : const SizedBox.shrink(),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    FilledButton.icon(
                      onPressed: _saving ? null : _queueSignature,
                      icon: _saving
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.save_outlined),
                      label: const Text('Queue Signature'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SignaturePainter extends CustomPainter {
  const _SignaturePainter(this.points);

  final List<Offset?> points;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = FieldCorePalette.midnight
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    for (var i = 0; i < points.length - 1; i += 1) {
      final current = points[i];
      final next = points[i + 1];
      if (current != null && next != null) canvas.drawLine(current, next, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _SignaturePainter oldDelegate) => oldDelegate.points != points;
}
