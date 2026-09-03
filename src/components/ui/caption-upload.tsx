'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Upload } from 'lucide-react';
import { type CloudinaryUploadWidgetResults } from 'next-cloudinary';

import { recordUploadAction } from '~/server/media/actions';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { cloudinaryConfigured } from '~/components/ui/media-picker-config';

const CldUploadWidget = dynamic(
  () => import('next-cloudinary').then((module) => module.CldUploadWidget),
  { ssr: false },
);

export function CaptionUploadField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const t = useTranslations('recipeEditor');
  const [error, setError] = React.useState<string | null>(null);

  function recordUpload(info: Exclude<CloudinaryUploadWidgetResults['info'], string | undefined>) {
    onChange(info.secure_url);
    void recordUploadAction({
      url: info.secure_url,
      publicId: typeof info.public_id === 'string' ? info.public_id : undefined,
      bytes: typeof info.bytes === 'number' ? info.bytes : undefined,
      format: typeof info.format === 'string' ? info.format : undefined,
      folder: 'heirloom/captions',
    }).then(
      (result) => setError(result.ok ? null : result.error),
      () => setError(t('captionUploadError')),
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="url"
          inputMode="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t('placeholders.captionUrl')}
          aria-label={t('captionUrl')}
          className="flex-1"
        />
        {cloudinaryConfigured ? (
          <CldUploadWidget
            signatureEndpoint="/api/cloudinary/sign"
            options={{
              folder: 'heirloom/captions',
              maxFiles: 1,
              resourceType: 'raw',
              sources: ['local'],
              clientAllowedFormats: ['vtt'],
              maxFileSize: 1_000_000,
            }}
            onSuccess={(result: CloudinaryUploadWidgetResults) => {
              if (result.info && typeof result.info !== 'string') recordUpload(result.info);
            }}
          >
            {({ open }) => (
              <Button type="button" variant="outline" onClick={() => open()}>
                <Upload aria-hidden="true" />
                {t('uploadCaptions')}
              </Button>
            )}
          </CldUploadWidget>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t('captionHint')}</p>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
