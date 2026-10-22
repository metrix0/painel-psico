-- Existing deployments: qualify the outer Storage object name inside patient subqueries.
-- Unqualified "name" resolves to psico_patients.name and rejects every upload.
alter policy "psico_patient_photo_read" on storage.objects
using (
  bucket_id = 'psico-patient-photos'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and storage.filename(storage.objects.name) = 'photo'
  and exists (select 1 from public.psico_patients p
              where p.id::text = (storage.foldername(storage.objects.name))[2]
                and p.owner_id = (select auth.uid()))
);

alter policy "psico_patient_photo_insert" on storage.objects
with check (
  bucket_id = 'psico-patient-photos'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and storage.filename(storage.objects.name) = 'photo'
  and exists (select 1 from public.psico_patients p
              where p.id::text = (storage.foldername(storage.objects.name))[2]
                and p.owner_id = (select auth.uid()))
);

alter policy "psico_patient_photo_update" on storage.objects
using (
  bucket_id = 'psico-patient-photos'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and storage.filename(storage.objects.name) = 'photo'
  and exists (select 1 from public.psico_patients p
              where p.id::text = (storage.foldername(storage.objects.name))[2]
                and p.owner_id = (select auth.uid()))
)
with check (
  bucket_id = 'psico-patient-photos'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and storage.filename(storage.objects.name) = 'photo'
  and exists (select 1 from public.psico_patients p
              where p.id::text = (storage.foldername(storage.objects.name))[2]
                and p.owner_id = (select auth.uid()))
);
