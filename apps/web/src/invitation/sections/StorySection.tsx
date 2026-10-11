/**
 * Nuestra historia: párrafos de la pareja + fotos intercaladas.
 * El esquema permite que un "párrafo" sea en realidad una URL de imagen, así
 * la organizadora puede armar un collage sin tocar código.
 */

import type { StorySchema, WeddingConfig } from '@boda/shared';
import type { z } from 'zod';
import { Reveal, SectionShell } from './parts';

type Story = z.infer<typeof StorySchema>;

export interface StorySectionProps {
  config: WeddingConfig;
}

/** Un párrafo que en realidad es una imagen suelta. */
const IMAGE_PARAGRAPH = /^(https?:\/\/|\/|data:image\/)/i;

export function StorySection({ config }: StorySectionProps): JSX.Element | null {
  const story: Story = config.story;
  const paragraphs = story.paragraphs.map((p) => p.trim()).filter(Boolean);
  const photos = story.photos.filter(Boolean);

  if (paragraphs.length === 0 && photos.length === 0) return null;

  const textParts = paragraphs.filter((p) => !IMAGE_PARAGRAPH.test(p));

  return (
    <SectionShell id="story" eyebrow="Nuestra historia" title="Cómo llegamos hasta acá">
      <div className="story">
        {textParts.length > 0 ? (
          <Reveal className="story__text">
            {textParts.map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 12)}`} className="story__paragraph">
                {paragraph}
              </p>
            ))}
          </Reveal>
        ) : null}

        {photos.length > 0 ? (
          <div className={`story__photos${photos.length === 1 ? ' story__photos--single' : ''}`}>
            {photos.map((photo, index) => (
              <Reveal as="figure" key={photo} delay={index * 70} className="story__photo">
                <img src={photo} alt="" loading="lazy" decoding="async" />
              </Reveal>
            ))}
          </div>
        ) : null}
      </div>
    </SectionShell>
  );
}

export default StorySection;
