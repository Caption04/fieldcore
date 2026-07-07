class FieldCoreJob {
  const FieldCoreJob({
    required this.id,
    required this.title,
    required this.status,
    required this.updatedAt,
    this.scheduledStart,
    this.customerName,
    this.serviceName,
    this.address,
    this.raw = const <String, dynamic>{},
  });

  final String id;
  final String title;
  final String status;
  final DateTime? scheduledStart;
  final DateTime updatedAt;
  final String? customerName;
  final String? serviceName;
  final String? address;
  final Map<String, dynamic> raw;

  factory FieldCoreJob.fromJson(Map<String, dynamic> json) {
    final customer = _map(json['customer']);
    final service = _map(json['service']);
    final property = _map(json['property']);
    final fallbackTitle = service?['name'] ?? json['serviceType'] ?? json['jobNumber'] ?? 'Job';

    return FieldCoreJob(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? fallbackTitle.toString(),
      status: json['status']?.toString() ?? 'UNKNOWN',
      scheduledStart: _date(json['scheduledStart'] ?? json['startTime']),
      updatedAt: _date(json['updatedAt']) ?? DateTime.fromMillisecondsSinceEpoch(0),
      customerName: customer?['name']?.toString() ?? json['customerName']?.toString(),
      serviceName: service?['name']?.toString() ?? json['serviceName']?.toString(),
      address: property?['address']?.toString() ?? json['address']?.toString(),
      raw: json,
    );
  }

  static Map<String, dynamic>? _map(Object? value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return value.map((key, value) => MapEntry(key.toString(), value));
    return null;
  }

  static DateTime? _date(Object? value) {
    if (value == null) return null;
    return DateTime.tryParse(value.toString());
  }
}
