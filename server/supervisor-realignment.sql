-- Batch 127: Supervisor Realignment
-- 15 agents reassigned effective April 7, 2026
-- Renier Marilao → Cris Dacanay David effective Feb 23, 2026

-- =====================================================
-- PART 1: Update io_employees (current supervisor)
-- =====================================================

-- Agents 1-2: Shella Nimer, Andrie Vervaleene Amurao → Joshua Veloso Aspera (already Aspera, but from Shibu Chacko per table)
-- Per the table: current supervisor is Shibu Chacko, new is Joshua Veloso Aspera
-- In DB they already show Aspera. The table says current is Chacko → new is Aspera. These may already be correct.
-- We'll set them to Aspera anyway to be safe.
UPDATE io_employees SET supervisor_name = 'Aspera, Brianna Veloso', supervisor_email = 'asperajoshua@meta.com' WHERE ohr_id IN ('740054135', '740054050');

-- Agents 3-4: Natividad Marie Avee Jay, Orjalo Madeline → Jerome Anthony Navarra (Abiang)
UPDATE io_employees SET supervisor_name = 'Abiang, Jerome Anthony Navarra', supervisor_email = 'abjeromeanthony@meta.com' WHERE ohr_id IN ('740041868', '740032659');

-- Agents 5-7: Canete Danilo, Soliven Peniel Joy, Romero Krantz → Arvin Maurice Hernandez (Bantasan)
UPDATE io_employees SET supervisor_name = 'Bantasan, Arvin Maurice Hernandez', supervisor_email = 'banarvinmaurice@meta.com' WHERE ohr_id IN ('740032190', '740052326', '740027103');

-- Agents 8-9: Manalo Henzi Sophia, Magomnang Nasrima → Julius Docena (Escamillas)
UPDATE io_employees SET supervisor_name = 'Escamillas, Julius Docena', supervisor_email = 'escamillajulius@meta.com' WHERE ohr_id IN ('740037450', '740053852');

-- Agents 10-12: Berja Monica, Aquino Danica, Cabural Lovely Grace → Brunie Mar Lapara (Galula)
UPDATE io_employees SET supervisor_name = 'Galula, Brunie Mar Lapara', supervisor_email = 'galulabruniemar@meta.com' WHERE ohr_id IN ('740037488', '740044795', '740053897');

-- Agent 13: Molina Charlotte → Ferodelyn Ballesteros (Javier)
UPDATE io_employees SET supervisor_name = 'Javier, Ferodelyn Ballesteros', supervisor_email = 'ferodelyn@meta.com' WHERE ohr_id = '740053748';

-- Agent 14: Dominguez Sein Gabriel → Gabriel Miguel Natividad
UPDATE io_employees SET supervisor_name = 'Natividad, Gabriel Miguel Arandia', supervisor_email = 'nagabrielmiguel@meta.com' WHERE ohr_id = '740053835';

-- Agent 15: Jamen Greggy → Eden Esmino
UPDATE io_employees SET supervisor_name = 'Esmino, Eden Zamora', supervisor_email = 'esminoeden@meta.com' WHERE ohr_id = '740031291';

-- Renier Marilao → Cris Dacanay David
UPDATE io_employees SET supervisor_name = 'David, Cris Erickson Dacanay', supervisor_email = 'dacanaydavicris@meta.com' WHERE ohr_id = '740037493';

-- =====================================================
-- PART 2: Update io_attendance snap_supervisor for historical records
-- =====================================================

-- 15 agents: effective April 7, 2026 onward
UPDATE io_attendance SET snap_supervisor = 'Aspera, Brianna Veloso' WHERE ohr_id IN ('740054135', '740054050') AND log_date >= '2026-04-07';

UPDATE io_attendance SET snap_supervisor = 'Abiang, Jerome Anthony Navarra' WHERE ohr_id IN ('740041868', '740032659') AND log_date >= '2026-04-07';

UPDATE io_attendance SET snap_supervisor = 'Bantasan, Arvin Maurice Hernandez' WHERE ohr_id IN ('740032190', '740052326', '740027103') AND log_date >= '2026-04-07';

UPDATE io_attendance SET snap_supervisor = 'Escamillas, Julius Docena' WHERE ohr_id IN ('740037450', '740053852') AND log_date >= '2026-04-07';

UPDATE io_attendance SET snap_supervisor = 'Galula, Brunie Mar Lapara' WHERE ohr_id IN ('740037488', '740044795', '740053897') AND log_date >= '2026-04-07';

UPDATE io_attendance SET snap_supervisor = 'Javier, Ferodelyn Ballesteros' WHERE ohr_id = '740053748' AND log_date >= '2026-04-07';

UPDATE io_attendance SET snap_supervisor = 'Natividad, Gabriel Miguel Arandia' WHERE ohr_id = '740053835' AND log_date >= '2026-04-07';

UPDATE io_attendance SET snap_supervisor = 'Esmino, Eden Zamora' WHERE ohr_id = '740031291' AND log_date >= '2026-04-07';

-- Renier Marilao: effective Feb 23, 2026 onward
UPDATE io_attendance SET snap_supervisor = 'David, Cris Erickson Dacanay' WHERE ohr_id = '740037493' AND log_date >= '2026-02-23';
