-- Profile photos are kept private and scoped to the signed-in user.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('psico-avatars', 'psico-avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "psico_avatar_read" on storage.objects for select to authenticated
using (bucket_id = 'psico-avatars' and name = (select auth.uid())::text || '/avatar');

create policy "psico_avatar_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'psico-avatars' and name = (select auth.uid())::text || '/avatar');

create policy "psico_avatar_update" on storage.objects for update to authenticated
using (bucket_id = 'psico-avatars' and name = (select auth.uid())::text || '/avatar')
with check (bucket_id = 'psico-avatars' and name = (select auth.uid())::text || '/avatar');
