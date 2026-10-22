-- Photos belong to patients, not user profiles.
-- Paths: <owner_id>/<patient_id>/photo. Files are private (max 2 MB).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('psico-patient-photos', 'psico-patient-photos', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Check both account ownership and existence of the patient.
create policy "psico_patient_photo_read" on storage.objects for select to authenticated
using (
  bucket_id = 'psico-patient-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.filename(name) = 'photo'
  and exists (select 1 from public.psico_patients p
              where p.id::text = (storage.foldername(storage.objects.name))[2]
                and p.owner_id = (select auth.uid()))
);

create policy "psico_patient_photo_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'psico-patient-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.filename(name) = 'photo'
  and exists (select 1 from public.psico_patients p
              where p.id::text = (storage.foldername(storage.objects.name))[2]
                and p.owner_id = (select auth.uid()))
);

create policy "psico_patient_photo_update" on storage.objects for update to authenticated
using (
  bucket_id = 'psico-patient-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.filename(name) = 'photo'
  and exists (select 1 from public.psico_patients p
              where p.id::text = (storage.foldername(storage.objects.name))[2]
                and p.owner_id = (select auth.uid()))
)
with check (
  bucket_id = 'psico-patient-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.filename(name) = 'photo'
  and exists (select 1 from public.psico_patients p
              where p.id::text = (storage.foldername(storage.objects.name))[2]
                and p.owner_id = (select auth.uid()))
);

-- Allows deleting a photo after its patient record has been removed.
create policy "psico_patient_photo_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'psico-patient-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.filename(name) = 'photo'
);