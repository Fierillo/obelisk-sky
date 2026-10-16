// obelisk-dex's message body (components/chat/message/MessageContent.tsx at
// the vendored commit), composed from the app's own view model and pieces:
// markdown with GFM and spoilers, live mention chips, custom emoji, code
// blocks, the image gallery and lightbox, video and audio players, YouTube
// and link previews. Three hoisted cards are sky's instead: a game marker
// opens sky's game table, an invoice is a plain chip (sky has no wallet),
// and stickers aren't sent by sky's composer.

import { ChatYouTubeEmbed } from '@/components/chat/message/ChatYouTubeEmbed';
import LinkPreview from '@/components/chat/message/LinkPreview';
import { RemoteMediaPlaceholder } from '@/components/chat/message/RemoteMediaPlaceholder';
import ImageGallery from '@/components/chat/gallery/ImageGallery';
import { VoiceMessage } from '@/components/chat/message/VoiceMessage';
import { VideoMedia } from '@/components/chat/message/VideoMedia';
import { WelcomeBanner } from '@/components/chat/message/WelcomeBanner';
import { useMessageContent } from '@/hooks/chat/message/useMessageContent';
import type { CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import type { MessageVoiceNote } from '@/utils/media/tags/voice-note-tags';

export interface SkyMessageProps {
  content: string;
  channelId: string;
  customEmojis?: CustomEmojiMap;
  /** A voice note (its `voice` tag): the player with its length, the body's URL hoisted into it. */
  voiceNote?: MessageVoiceNote;
  voiceAuthorPicture?: string | null;
  voiceTimestamp?: number;
  onGame?: (gameId: string) => void;
}

export default function SkyMessageContent({ content, channelId, customEmojis, voiceNote, voiceAuthorPicture, voiceTimestamp, onGame }: SkyMessageProps) {
  const {
    imageUrls, videoUrls, audioUrls, youtube, linkUrls,
    welcomeBanner, invoices, gameIds, text, media, components, renderMarkdown,
  } = useMessageContent({ content, channelId, customEmojis, voiceNote });
  return (
    <span data-testid="message-content">
      {voiceNote && <VoiceMessage note={voiceNote} authorPicture={voiceAuthorPicture} timestamp={voiceTimestamp} autoLoad={media.show} />}
      {text && (renderMarkdown
        ? renderMarkdown(text, components)
        : <span data-testid="message-text-loading">{text}</span>)}
      {welcomeBanner && <WelcomeBanner src={welcomeBanner.src} alt={welcomeBanner.alt} />}
      {!media.show && imageUrls.length > 0 && <RemoteMediaPlaceholder onReveal={media.reveal} />}
      {imageUrls.length > 0 && media.show && <ImageGallery urls={imageUrls} />}
      {youtube.map((y) => <ChatYouTubeEmbed key={y.url} videoId={y.id} />)}
      {linkUrls.map((url) => <LinkPreview key={url} url={url} showImage={media.show} />)}
      {videoUrls.map((url) => <VideoMedia key={url} url={url} autoLoad={media.show} />)}
      {audioUrls.map((url) => (
        <VoiceMessage key={url} note={{ url, durationSeconds: 0 }} autoLoad={media.show} />
      ))}
      {invoices.map((inv) => (
        <span key={inv} className="game-chip" title="Pay it from obelisk.ar or any Lightning wallet">Lightning invoice</span>
      ))}
      {gameIds.map((id) => (
        <button key={id} type="button" className="game-chip" onClick={() => onGame?.(id)}>Game table</button>
      ))}
    </span>
  );
}
