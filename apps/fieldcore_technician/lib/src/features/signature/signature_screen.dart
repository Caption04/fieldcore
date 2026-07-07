import 'package:flutter/material.dart';

import '../../core/models/fieldcore_job.dart';
import '../../core/offline/offline_queue.dart';

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
      appBar: AppBar(title: const Text('Customer signature')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          TextField(controller: _signerController, decoration: const InputDecoration(labelText: 'Signer name', border: OutlineInputBorder())),
          const SizedBox(height: 16),
          Container(
            height: 220,
            decoration: BoxDecoration(border: Border.all(color: Theme.of(context).dividerColor), borderRadius: BorderRadius.circular(12)),
            child: GestureDetector(
              onPanUpdate: _addPoint,
              onPanEnd: (_) => setState(() => _points.add(null)),
              child: CustomPaint(painter: _SignaturePainter(_points), child: const SizedBox.expand()),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: <Widget>[
              TextButton.icon(onPressed: () => setState(_points.clear), icon: const Icon(Icons.delete_outline), label: const Text('Clear')),
              const Spacer(),
              FilledButton.icon(onPressed: _saving ? null : _queueSignature, icon: const Icon(Icons.save), label: const Text('Queue signature')),
            ],
          ),
        ],
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
