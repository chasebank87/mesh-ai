import { requestUrl } from 'obsidian';
import MeshAIPlugin from '../main';

export class YoutubeProvider {
  private plugin: MeshAIPlugin;

  constructor(plugin: MeshAIPlugin) {
    console.log('Initializing YoutubeProvider');
    this.plugin = plugin;
  }

  async getTranscript(url: string): Promise<string> {
    console.log(`[getTranscript] Attempting to fetch transcript for URL: ${url}`);
    try {
      const videoId = this.extractVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL, cannot extract video ID');
      }

      const transcript = await this.grabTranscriptBase(videoId);
      if (!transcript) {
        throw new Error('No transcript found for this video');
      }

      // Parse the XML transcript
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(transcript, "text/xml");
      const textTags = xmlDoc.getElementsByTagName('text');
      
      let fullTranscript = '';
      for (let i = 0; i < textTags.length; i++) {
        fullTranscript += textTags[i].textContent + ' ';
      }

      console.log(`[getTranscript] Transcript fetched successfully. Length: ${fullTranscript.length}`);
      return fullTranscript.trim();
    } catch (error) {
      console.error('[getTranscript] Error fetching YouTube transcript:', error);
      throw error;
    }
  }

  private async grabTranscriptBase(videoId: string): Promise<string | null> {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await requestUrl({ url });
    const html = response.text;

    const captionTracksRegex = /"captionTracks":(\[.*?\])/;
    const match = html.match(captionTracksRegex);
    
    if (match && match[1]) {
      const captionTracks = JSON.parse(match[1]);
      if (captionTracks.length > 0) {
        const transcriptUrl = captionTracks[0].baseUrl;
        const transcriptResponse = await requestUrl({ url: transcriptUrl });
        return transcriptResponse.text;
      }
    }

    return null;
  }

  extractVideoId(url: string): string | null {
    const pattern = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(pattern);
    return match ? match[1] : null;
  }
}