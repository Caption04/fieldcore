import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/models/fieldcore_job.dart';
import '../../core/offline/offline_queue.dart';
import '../../shared/premium_theme.dart';
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
  final _searchController = TextEditingController();
  List<FieldCoreJob> _jobs = <FieldCoreJob>[];
  bool _loading = true;
  String? _error;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() => setState(() => _query = _searchController.text.trim().toLowerCase()));
    _pullJobs();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
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
    final jobs = _filteredJobs;
    return Scaffold(
      body: PremiumBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: _pullJobs,
            color: FieldCorePalette.primaryBright,
            backgroundColor: FieldCorePalette.panel,
            child: _body(jobs),
          ),
        ),
      ),
      bottomNavigationBar: _BottomNav(onSync: _openSync, pendingCount: widget.offlineQueue.count),
    );
  }

  Widget _body(List<FieldCoreJob> jobs) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return PremiumEmptyState(icon: Icons.cloud_off_outlined, title: 'Could not load jobs', message: _error!);
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 22),
      children: <Widget>[
        _Header(onRefresh: _pullJobs, onSync: _openSync, onLogout: widget.onLogout, pendingCount: widget.offlineQueue.count),
        const SizedBox(height: 22),
        _StatsRow(jobs: _jobs),
        const SizedBox(height: 18),
        TextField(
          controller: _searchController,
          decoration: const InputDecoration(
            hintText: 'Search jobs',
            prefixIcon: Icon(Icons.search),
            suffixIcon: Icon(Icons.tune_rounded),
          ),
        ),
        const SizedBox(height: 18),
        if (_jobs.isEmpty)
          const _InlineEmptyState(icon: Icons.assignment_outlined, title: 'No jobs assigned', message: 'Assigned work will appear here once dispatch sends jobs to your device.')
        else if (jobs.isEmpty)
          const _InlineEmptyState(icon: Icons.search_off, title: 'No matching jobs', message: 'Try another customer, address, or job number.')
        else
          ...jobs.map(
            (job) => Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: _JobCard(job: job, onTap: () => _openJob(job)),
            ),
          ),
      ],
    );
  }

  List<FieldCoreJob> get _filteredJobs {
    if (_query.isEmpty) return _jobs;
    return _jobs.where((job) {
      final haystack = <String?>[job.id, job.title, job.status, job.customerName, job.serviceName, job.address].whereType<String>().join(' ').toLowerCase();
      return haystack.contains(_query);
    }).toList();
  }
}


class _InlineEmptyState extends StatelessWidget {
  const _InlineEmptyState({required this.icon, required this.title, required this.message});

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 18),
      child: PremiumCard(
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
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.onRefresh, required this.onSync, required this.onLogout, required this.pendingCount});

  final VoidCallback onRefresh;
  final VoidCallback onSync;
  final Future<void> Function() onLogout;
  final int pendingCount;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        const FieldCoreMark(size: 42),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text('Today’s Jobs', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900, letterSpacing: -0.5)),
              const SizedBox(height: 4),
              Text(_todayLabel(), style: const TextStyle(color: FieldCorePalette.muted)),
            ],
          ),
        ),
        IconButton.filledTonal(onPressed: onRefresh, icon: const Icon(Icons.refresh), tooltip: 'Pull jobs'),
        const SizedBox(width: 8),
        Stack(
          alignment: Alignment.topRight,
          children: <Widget>[
            IconButton.filledTonal(onPressed: onSync, icon: const Icon(Icons.sync), tooltip: 'Sync status'),
            if (pendingCount > 0)
              Container(
                margin: const EdgeInsets.only(top: 3, right: 3),
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(color: FieldCorePalette.danger, borderRadius: BorderRadius.circular(999)),
                child: Text('$pendingCount', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900)),
              ),
          ],
        ),
        const SizedBox(width: 8),
        IconButton.filledTonal(onPressed: onLogout, icon: const Icon(Icons.logout), tooltip: 'Log out'),
      ],
    );
  }

  String _todayLabel() {
    final now = DateTime.now();
    const months = <String>['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${_weekday(now.weekday)}, ${months[now.month - 1]} ${now.day}';
  }

  String _weekday(int day) => const <int, String>{1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday'}[day] ?? 'Today';
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.jobs});

  final List<FieldCoreJob> jobs;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Expanded(child: _StatCard(icon: Icons.assignment_ind_outlined, label: 'Assigned', value: jobs.length, color: FieldCorePalette.purple)),
        const SizedBox(width: 10),
        Expanded(child: _StatCard(icon: Icons.play_circle_outline, label: 'In Progress', value: _count('PROGRESS'), color: FieldCorePalette.primaryBright)),
        const SizedBox(width: 10),
        Expanded(child: _StatCard(icon: Icons.check_circle_outline, label: 'Done', value: _count('COMPLETE'), color: FieldCorePalette.success)),
      ],
    );
  }

  int _count(String statusPart) => jobs.where((job) => job.status.toUpperCase().contains(statusPart)).length;
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.icon, required this.label, required this.value, required this.color});

  final IconData icon;
  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 8),
          Text('$value', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(color: FieldCorePalette.muted, fontSize: 12)),
        ],
      ),
    );
  }
}

class _JobCard extends StatelessWidget {
  const _JobCard({required this.job, required this.onTap});

  final FieldCoreJob job;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final icon = _serviceIcon(job.serviceName ?? job.title);
    final color = _serviceColor(job.serviceName ?? job.title);
    return PremiumCard(
      onTap: onTap,
      glowColor: color,
      child: Row(
        children: <Widget>[
          PremiumIconTile(icon: icon, color: color),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Expanded(child: Text(job.id.isEmpty ? 'JOB' : job.id, style: const TextStyle(color: FieldCorePalette.muted, fontSize: 12, fontWeight: FontWeight.w700))),
                    StatusPill(label: job.status),
                  ],
                ),
                const SizedBox(height: 6),
                Text(job.title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                const SizedBox(height: 6),
                if ((job.address ?? '').isNotEmpty) _MetaLine(icon: Icons.place_outlined, text: job.address!),
                if (job.scheduledStart != null) _MetaLine(icon: Icons.schedule, text: _formatDate(job.scheduledStart!)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  IconData _serviceIcon(String value) {
    final text = value.toLowerCase();
    if (text.contains('clean')) return Icons.cleaning_services_outlined;
    if (text.contains('repair')) return Icons.build_circle_outlined;
    if (text.contains('inspect')) return Icons.search_outlined;
    if (text.contains('install')) return Icons.construction_outlined;
    if (text.contains('electric')) return Icons.bolt_outlined;
    return Icons.work_outline;
  }

  Color _serviceColor(String value) {
    final text = value.toLowerCase();
    if (text.contains('repair')) return FieldCorePalette.danger;
    if (text.contains('inspect')) return FieldCorePalette.warning;
    if (text.contains('clean')) return FieldCorePalette.cyan;
    return FieldCorePalette.primary;
  }

  String _formatDate(DateTime value) {
    return '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')} • ${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
  }
}

class _MetaLine extends StatelessWidget {
  const _MetaLine({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 3),
      child: Row(
        children: <Widget>[
          Icon(icon, color: FieldCorePalette.muted, size: 14),
          const SizedBox(width: 6),
          Expanded(child: Text(text, style: const TextStyle(color: FieldCorePalette.muted, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
  }
}

class _BottomNav extends StatelessWidget {
  const _BottomNav({required this.onSync, required this.pendingCount});

  final VoidCallback onSync;
  final int pendingCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: FieldCorePalette.midnight.withValues(alpha: 0.96),
        border: Border(top: BorderSide(color: FieldCorePalette.border.withValues(alpha: 0.5))),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          child: Row(
            children: <Widget>[
              const Expanded(child: _BottomNavItem(icon: Icons.assignment_rounded, label: 'Jobs', active: true)),
              const Expanded(child: _BottomNavItem(icon: Icons.calendar_month_outlined, label: 'Schedule')),
              Expanded(child: _BottomNavItem(icon: Icons.sync, label: pendingCount > 0 ? 'Sync $pendingCount' : 'Sync', onTap: onSync)),
              const Expanded(child: _BottomNavItem(icon: Icons.person_outline, label: 'Profile')),
            ],
          ),
        ),
      ),
    );
  }
}

class _BottomNavItem extends StatelessWidget {
  const _BottomNavItem({required this.icon, required this.label, this.active = false, this.onTap});

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? FieldCorePalette.primaryBright : FieldCorePalette.muted;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, color: color, size: 22),
            const SizedBox(height: 4),
            Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: active ? FontWeight.w800 : FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}
