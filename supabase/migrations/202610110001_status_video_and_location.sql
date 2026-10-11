alter table public.profiles
  add column if not exists status text,
  add column if not exists status_updated_at timestamptz,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_updated_at timestamptz;

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status is null or char_length(status) between 1 and 40);
alter table public.profiles drop constraint if exists profiles_coordinates_check;
alter table public.profiles add constraint profiles_coordinates_check
  check (
    (latitude is null and longitude is null) or
    (latitude between -90 and 90 and longitude between -180 and 180)
  );

alter table public.messages add column if not exists video_path text;
alter table public.messages drop constraint if exists messages_check;
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check
  check (nullif(trim(text), '') is not null or image_path is not null or video_path is not null);

update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic',
      'video/mp4', 'video/webm', 'video/quicktime'
    ]
where id = 'couple-media';
