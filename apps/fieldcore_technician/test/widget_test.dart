import 'package:fieldcore_technician/src/app.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('renders technician app', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await tester.pumpWidget(const FieldCoreTechnicianApp());
    await tester.pump();
    expect(find.byType(FieldCoreTechnicianApp), findsOneWidget);
  });
}
