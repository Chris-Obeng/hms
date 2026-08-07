INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hotel-assets',
  'hotel-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "hotel_assets_insert" ON storage.objects;
CREATE POLICY "hotel_assets_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'hotel-assets'
  AND (storage.foldername(name))[1] = 'hotels'
  AND ((storage.foldername(name))[2])::uuid IN (
    SELECT public.get_user_hotel_ids()
  )
);

DROP POLICY IF EXISTS "hotel_assets_select" ON storage.objects;
CREATE POLICY "hotel_assets_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'hotel-assets'
  AND (storage.foldername(name))[1] = 'hotels'
  AND ((storage.foldername(name))[2])::uuid IN (
    SELECT public.get_user_hotel_ids()
  )
);

DROP POLICY IF EXISTS "hotel_assets_update" ON storage.objects;
CREATE POLICY "hotel_assets_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'hotel-assets'
  AND (storage.foldername(name))[1] = 'hotels'
  AND ((storage.foldername(name))[2])::uuid IN (
    SELECT public.get_user_hotel_ids()
  )
)
WITH CHECK (
  bucket_id = 'hotel-assets'
  AND (storage.foldername(name))[1] = 'hotels'
  AND ((storage.foldername(name))[2])::uuid IN (
    SELECT public.get_user_hotel_ids()
  )
);

DROP POLICY IF EXISTS "hotel_assets_delete" ON storage.objects;
CREATE POLICY "hotel_assets_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'hotel-assets'
  AND (storage.foldername(name))[1] = 'hotels'
  AND ((storage.foldername(name))[2])::uuid IN (
    SELECT public.get_user_hotel_ids()
  )
);
