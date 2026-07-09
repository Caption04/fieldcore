import 'package:geolocator/geolocator.dart';

class FieldCoreLocationException implements Exception {
  const FieldCoreLocationException(this.message);

  final String message;

  @override
  String toString() => message;
}

class FieldCoreLocationReading {
  const FieldCoreLocationReading({
    required this.latitude,
    required this.longitude,
    required this.capturedAt,
    this.accuracyMeters,
  });

  final double latitude;
  final double longitude;
  final double? accuracyMeters;
  final DateTime capturedAt;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'latitude': latitude,
        'longitude': longitude,
        if (accuracyMeters != null) 'accuracy': accuracyMeters,
        'capturedAt': capturedAt.toIso8601String(),
      };
}

class FieldCoreLocationService {
  const FieldCoreLocationService._();

  static Future<FieldCoreLocationReading> currentPosition() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw const FieldCoreLocationException('Location services are off. Turn on GPS/location to update dispatch.');
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.denied) {
      throw const FieldCoreLocationException('Location permission was denied. Allow location access to update dispatch.');
    }

    if (permission == LocationPermission.deniedForever) {
      throw const FieldCoreLocationException('Location permission is permanently denied. Enable it from app settings.');
    }

    final position = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 20),
      ),
    );

    return FieldCoreLocationReading(
      latitude: position.latitude,
      longitude: position.longitude,
      accuracyMeters: position.accuracy.isFinite ? position.accuracy : null,
      capturedAt: DateTime.now(),
    );
  }
}
