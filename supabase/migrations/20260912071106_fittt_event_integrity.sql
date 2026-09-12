-- FITTT event dates are immutable after creation. Recreate a future event to reschedule.
revoke update on public.fittt_events from authenticated;
