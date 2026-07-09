import 'package:flutter/material.dart';

class FieldCorePalette {
  const FieldCorePalette._();

  static const Color midnight = Color(0xFF031326);
  static const Color navy = Color(0xFF061B35);
  static const Color panel = Color(0xFF0A2445);
  static const Color panelSoft = Color(0xFF102F57);
  static const Color border = Color(0xFF264B78);
  static const Color primary = Color(0xFF168BFF);
  static const Color primaryBright = Color(0xFF27C2FF);
  static const Color cyan = Color(0xFF26D7FF);
  static const Color success = Color(0xFF25D695);
  static const Color warning = Color(0xFFFFB23E);
  static const Color danger = Color(0xFFFF5A73);
  static const Color purple = Color(0xFF8A6CFF);
  static const Color text = Color(0xFFF6FAFF);
  static const Color muted = Color(0xFF9FB4D1);
}

class FieldCorePremiumTheme {
  const FieldCorePremiumTheme._();

  static ThemeData get theme {
    final scheme = ColorScheme.fromSeed(
      seedColor: FieldCorePalette.primary,
      brightness: Brightness.dark,
      primary: FieldCorePalette.primary,
      secondary: FieldCorePalette.cyan,
      surface: FieldCorePalette.panel,
      error: FieldCorePalette.danger,
    );

    final base = ThemeData(
      colorScheme: scheme,
      brightness: Brightness.dark,
      useMaterial3: true,
      scaffoldBackgroundColor: Colors.transparent,
      fontFamily: 'Roboto',
    );

    return base.copyWith(
      textTheme: base.textTheme.apply(
        bodyColor: FieldCorePalette.text,
        displayColor: FieldCorePalette.text,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        foregroundColor: FieldCorePalette.text,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        color: FieldCorePalette.panel,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.055),
        labelStyle: const TextStyle(color: FieldCorePalette.muted),
        hintStyle: TextStyle(color: FieldCorePalette.muted.withValues(alpha: 0.72)),
        prefixIconColor: FieldCorePalette.muted,
        suffixIconColor: FieldCorePalette.muted,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(color: FieldCorePalette.border.withValues(alpha: 0.72)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: FieldCorePalette.primaryBright, width: 1.4),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: FieldCorePalette.danger),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: FieldCorePalette.danger, width: 1.4),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: FieldCorePalette.primary,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, letterSpacing: 0.2),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: FieldCorePalette.text,
          side: BorderSide(color: FieldCorePalette.border.withValues(alpha: 0.9)),
          minimumSize: const Size.fromHeight(50),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: FieldCorePalette.panelSoft,
        contentTextStyle: const TextStyle(color: FieldCorePalette.text),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      dividerTheme: DividerThemeData(color: FieldCorePalette.border.withValues(alpha: 0.45)),
      iconTheme: const IconThemeData(color: FieldCorePalette.text),
    );
  }
}

class PremiumBackground extends StatelessWidget {
  const PremiumBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[
            Color(0xFF021122),
            Color(0xFF061B35),
            Color(0xFF031326),
          ],
        ),
      ),
      child: Stack(
        children: <Widget>[
          Positioned(
            top: -80,
            left: -80,
            child: _GlowBlob(color: FieldCorePalette.primaryBright.withValues(alpha: 0.18), size: 240),
          ),
          Positioned(
            top: 160,
            right: -120,
            child: _GlowBlob(color: FieldCorePalette.primary.withValues(alpha: 0.16), size: 300),
          ),
          Positioned(
            bottom: -140,
            left: -60,
            child: _GlowBlob(color: FieldCorePalette.cyan.withValues(alpha: 0.12), size: 320),
          ),
          child,
        ],
      ),
    );
  }
}

class _GlowBlob extends StatelessWidget {
  const _GlowBlob({required this.color, required this.size});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: <BoxShadow>[
          BoxShadow(color: color, blurRadius: size / 2.7, spreadRadius: size / 5),
        ],
      ),
    );
  }
}

class PremiumCard extends StatelessWidget {
  const PremiumCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.margin = EdgeInsets.zero,
    this.onTap,
    this.glowColor,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  final VoidCallback? onTap;
  final Color? glowColor;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      margin: margin,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[
            Colors.white.withValues(alpha: 0.085),
            FieldCorePalette.panel.withValues(alpha: 0.86),
          ],
        ),
        border: Border.all(color: FieldCorePalette.border.withValues(alpha: 0.72)),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: (glowColor ?? Colors.black).withValues(alpha: glowColor == null ? 0.24 : 0.18),
            blurRadius: glowColor == null ? 24 : 34,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Padding(padding: padding, child: child),
    );

    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onTap,
        child: card,
      ),
    );
  }
}

class PremiumIconTile extends StatelessWidget {
  const PremiumIconTile({super.key, required this.icon, this.color = FieldCorePalette.primary});

  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[color.withValues(alpha: 0.78), color.withValues(alpha: 0.22)],
        ),
        boxShadow: <BoxShadow>[
          BoxShadow(color: color.withValues(alpha: 0.24), blurRadius: 22, offset: const Offset(0, 8)),
        ],
      ),
      child: Icon(icon, color: Colors.white),
    );
  }
}

class FieldCoreMark extends StatelessWidget {
  const FieldCoreMark({super.key, this.size = 46});

  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _FieldCoreMarkPainter()),
    );
  }
}

class _FieldCoreMarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: <Color>[FieldCorePalette.primaryBright, FieldCorePalette.primary],
      ).createShader(Offset.zero & size);

    final radius = Radius.circular(size.height * 0.16);
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(size.width * 0.05, size.height * 0.1, size.width * 0.82, size.height * 0.22), radius),
      paint,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(size.width * 0.05, size.height * 0.41, size.width * 0.56, size.height * 0.2), radius),
      paint,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(size.width * 0.05, size.height * 0.7, size.width * 0.3, size.height * 0.18), radius),
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class PremiumEmptyState extends StatelessWidget {
  const PremiumEmptyState({super.key, required this.icon, required this.title, required this.message});

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: <Widget>[
        const SizedBox(height: 90),
        PremiumCard(
          child: Column(
            children: <Widget>[
              PremiumIconTile(icon: icon, color: FieldCorePalette.cyan),
              const SizedBox(height: 18),
              Text(title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900), textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text(message, style: const TextStyle(color: FieldCorePalette.muted), textAlign: TextAlign.center),
            ],
          ),
        ),
      ],
    );
  }
}
