import 'package:flutter/material.dart';

import '../../config/environment.dart';
import '../../core/api/api_client.dart';
import '../../shared/premium_theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.apiClient, required this.onAuthenticated});

  final FieldCoreApiClient apiClient;
  final Future<void> Function() onAuthenticated;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _apiBaseController = TextEditingController(text: FieldCoreEnvironment.defaultApiBaseUrl);
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.apiClient.loadSession().then((_) {
      if (!mounted) return;
      _apiBaseController.text = widget.apiClient.baseUrl;
    });
  }

  @override
  void dispose() {
    _apiBaseController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await widget.apiClient.login(
        email: _emailController.text.trim(),
        password: _passwordController.text,
        apiBaseUrl: _apiBaseController.text.trim(),
      );
      await widget.onAuthenticated();
    } on FieldCoreApiException catch (error) {
      setState(() => _error = error.message);
    } catch (error) {
      setState(() => _error = 'Login failed: $error');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PremiumBackground(
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.all(24),
                children: <Widget>[
                  const SizedBox(height: 8),
                  const _LoginBrand(),
                  const SizedBox(height: 30),
                  PremiumCard(
                    glowColor: FieldCorePalette.primary,
                    padding: const EdgeInsets.all(22),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: <Widget>[
                          Text(
                            'Technician access',
                            style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Connect to your company workspace and register this device.',
                            style: TextStyle(color: FieldCorePalette.muted, height: 1.35),
                          ),
                          const SizedBox(height: 22),
                          TextFormField(
                            controller: _apiBaseController,
                            decoration: const InputDecoration(
                              labelText: 'API base URL',
                              prefixIcon: Icon(Icons.cloud_outlined),
                            ),
                            validator: (value) => value == null || value.trim().isEmpty ? 'Required' : null,
                          ),
                          const SizedBox(height: 14),
                          TextFormField(
                            controller: _emailController,
                            decoration: const InputDecoration(
                              labelText: 'Technician email',
                              prefixIcon: Icon(Icons.alternate_email),
                            ),
                            keyboardType: TextInputType.emailAddress,
                            validator: (value) => value == null || value.trim().isEmpty ? 'Required' : null,
                          ),
                          const SizedBox(height: 14),
                          TextFormField(
                            controller: _passwordController,
                            decoration: const InputDecoration(
                              labelText: 'Password',
                              prefixIcon: Icon(Icons.lock_outline),
                            ),
                            obscureText: true,
                            validator: (value) => value == null || value.isEmpty ? 'Required' : null,
                          ),
                          if (_error != null) ...<Widget>[
                            const SizedBox(height: 16),
                            _ErrorBanner(message: _error!),
                          ],
                          const SizedBox(height: 22),
                          DecoratedBox(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(18),
                              boxShadow: <BoxShadow>[
                                BoxShadow(
                                  color: FieldCorePalette.primary.withValues(alpha: 0.34),
                                  blurRadius: 26,
                                  offset: const Offset(0, 12),
                                ),
                              ],
                            ),
                            child: FilledButton.icon(
                              onPressed: _submitting ? null : _login,
                              icon: _submitting
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                    )
                                  : const Icon(Icons.arrow_forward_rounded),
                              label: const Text('Log in and register device'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: <Widget>[
                      Icon(Icons.shield_outlined, color: FieldCorePalette.muted, size: 16),
                      SizedBox(width: 8),
                      Text('Offline-ready. Secure sync. Field-first.', style: TextStyle(color: FieldCorePalette.muted)),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _LoginBrand extends StatelessWidget {
  const _LoginBrand();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        Container(
          width: 92,
          height: 92,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(28),
            color: Colors.white.withValues(alpha: 0.06),
            border: Border.all(color: FieldCorePalette.border),
            boxShadow: <BoxShadow>[
              BoxShadow(color: FieldCorePalette.cyan.withValues(alpha: 0.18), blurRadius: 36, offset: const Offset(0, 18)),
            ],
          ),
          child: const Center(child: FieldCoreMark(size: 58)),
        ),
        const SizedBox(height: 20),
        Text(
          'FieldCore Technician',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900, letterSpacing: -0.4),
        ),
        const SizedBox(height: 8),
        const Text('Work. Track. Complete.', style: TextStyle(color: FieldCorePalette.muted, fontSize: 16)),
      ],
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: FieldCorePalette.danger.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: FieldCorePalette.danger.withValues(alpha: 0.36)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Icon(Icons.error_outline, color: FieldCorePalette.danger, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: const TextStyle(color: FieldCorePalette.text, height: 1.35))),
        ],
      ),
    );
  }
}
