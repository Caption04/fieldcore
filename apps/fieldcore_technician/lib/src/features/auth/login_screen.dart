import 'package:flutter/material.dart';

import '../../config/environment.dart';
import '../../core/api/api_client.dart';

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
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _formKey,
                child: ListView(
                  shrinkWrap: true,
                  children: <Widget>[
                    const Icon(Icons.engineering, size: 56),
                    const SizedBox(height: 16),
                    Text('FieldCore Technician', style: Theme.of(context).textTheme.headlineMedium, textAlign: TextAlign.center),
                    const SizedBox(height: 8),
                    Text('Offline-ready job cards, proof, parts, and sync.', style: Theme.of(context).textTheme.bodyMedium, textAlign: TextAlign.center),
                    const SizedBox(height: 32),
                    TextFormField(
                      controller: _apiBaseController,
                      decoration: const InputDecoration(labelText: 'API base URL', border: OutlineInputBorder()),
                      validator: (value) => value == null || value.trim().isEmpty ? 'Required' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _emailController,
                      decoration: const InputDecoration(labelText: 'Technician email', border: OutlineInputBorder()),
                      keyboardType: TextInputType.emailAddress,
                      validator: (value) => value == null || value.trim().isEmpty ? 'Required' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _passwordController,
                      decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()),
                      obscureText: true,
                      validator: (value) => value == null || value.isEmpty ? 'Required' : null,
                    ),
                    if (_error != null) ...<Widget>[
                      const SizedBox(height: 12),
                      Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ],
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: _submitting ? null : _login,
                      icon: _submitting ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.login),
                      label: const Text('Log in and register device'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
