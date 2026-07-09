import 'package:flutter/material.dart';

import 'premium_theme.dart';

class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final color = _statusColor(label);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.42)),
        boxShadow: <BoxShadow>[
          BoxShadow(color: color.withValues(alpha: 0.12), blurRadius: 18, offset: const Offset(0, 8)),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Container(width: 7, height: 7, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(
            _cleanLabel(label),
            style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.1),
          ),
        ],
      ),
    );
  }

  Color _statusColor(String value) {
    final normalized = value.toUpperCase();
    if (normalized.contains('COMPLETE') || normalized == 'DONE') return FieldCorePalette.success;
    if (normalized.contains('PROGRESS') || normalized.contains('START')) return FieldCorePalette.primaryBright;
    if (normalized.contains('SCHEDULE') || normalized.contains('PENDING') || normalized.contains('ASSIGNED')) return FieldCorePalette.warning;
    if (normalized.contains('CANCEL') || normalized.contains('FAIL') || normalized.contains('OVERDUE')) return FieldCorePalette.danger;
    return FieldCorePalette.purple;
  }

  String _cleanLabel(String value) {
    return value
        .replaceAll('_', ' ')
        .toLowerCase()
        .split(' ')
        .where((word) => word.isNotEmpty)
        .map((word) => '${word[0].toUpperCase()}${word.substring(1)}')
        .join(' ');
  }
}
