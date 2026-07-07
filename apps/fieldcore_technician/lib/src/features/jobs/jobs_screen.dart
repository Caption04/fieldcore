import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/models/fieldcore_job.dart';
import '../../core/offline/offline_queue.dart';
import '../../shared/status_pill.dart';
import '../sync/sync_status_screen.dart';
import 'job_detail_screen.dart';

class JobsScreen extends StatefulWidget {
  const JobsScreen({
    super.key,
    required this.apiClient,
    required this.offlineQueue,
    required this.onLogout,
  });

  final FieldCoreApiClient apiClient;
  final OfflineQueueRepository offlineQueue;
  final Future<void> Function() onLogout;

  @override
  State<JobsScreen> createState() => _JobsScreenState();
}

class _JobsScreenState extends State<JobsScreen> {
  List<FieldCoreJob> _jobs = <FieldCoreJob>[];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _pullJobs();
  }

  Future<void> _pullJobs() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final jobs = await widget.apiClient.pullJobs();
      if (!mounted) return;
      setState(() => _jobs = jobs);
    } on FieldCoreApiException catch (error) {
      setState(() => _error = error.message);
    } catch (error) {
      setState(() => _error = 'Could not load jobs: $error');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openSync() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => SyncStatusScreen(apiClient: widget.apiClient, offlineQueue: widget.offlineQueue),
    ));
    await widget.offlineQueue.load();
    if (mounted) setState(() {});
  }

  Future<void> _openJob(FieldCoreJob job) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => JobDetailScreen(apiClient: widget.apiClient, offlineQueue: widget.offlineQueue, job: job),
    ));
    await widget.offlineQueue.load();
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Today'),
        actions: <Widget>[
          IconButton(onPressed: _pullJobs, icon: const Icon(Icons.refresh), tooltip: 'Pull jobs'),
          Stack(
            alignment: Alignment.topRight,
            children: <Widget>[
              IconButton(onPressed: _openSync, icon: const Icon(Icons.sync), tooltip: 'Sync status'),
              if (widget.offlineQueue.count > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 6, right: 6),
                  child: CircleAvatar(radius: 9, child: Text('${widget.offlineQueue.count}', style: const TextStyle(fontSize: 10))),
                ),
            ],
          ),
          IconButton(onPressed: widget.onLogout, icon: const Icon(Icons.logout), tooltip: 'Log out'),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _pullJobs,
        child: _body(),
      ),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return ListView(children: <Widget>[Padding(padding: const EdgeInsets.all(16), child: Text(_error!))]);
    if (_jobs.isEmpty) return ListView(children: const <Widget>[Padding(padding: EdgeInsets.all(16), child: Text('No assigned jobs found.'))]);
    return ListView.separated(
      itemCount: _jobs.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final job = _jobs[index];
        return ListTile(
          title: Text(job.title),
          subtitle: Text([job.customerName, job.address, _formatDate(job.scheduledStart)].whereType<String>().where((value) => value.isNotEmpty).join(' • ')),
          trailing: StatusPill(label: job.status),
          onTap: () => _openJob(job),
        );
      },
    );
  }

  String? _formatDate(DateTime? value) {
    if (value == null) return null;
    return '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')} ${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
  }
}
