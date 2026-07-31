-- Fuel charge details on request line items (messengers / cash requesters, non-job).
-- From/to km and liters. Vehicle plate lives on vehicle_number (migration 023).

ALTER TABLE request_charges
  ADD COLUMN fuel_from_km DECIMAL(12,2) NULL AFTER driver_id,
  ADD COLUMN fuel_to_km DECIMAL(12,2) NULL AFTER fuel_from_km,
  ADD COLUMN fuel_liters DECIMAL(12,3) NULL AFTER fuel_to_km;
