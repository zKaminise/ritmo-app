DO $$
DECLARE
  table_name text;
  role_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    FOREACH table_name IN ARRAY ARRAY[
      'User', 'Session', 'UserSettings', 'Category', 'RoutineRule', 'RoutineException',
      'CalendarEvent', 'ScheduledOccurrence', 'Reminder', 'PushSubscription',
      'NotificationDelivery', 'Goal', 'CompletionLog', 'FocusSession',
      'IncidentLearning', 'SchedulerState', '_prisma_migrations'
    ] LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
        END IF;
      END LOOP;
    END LOOP;
  END IF;
END $$;
