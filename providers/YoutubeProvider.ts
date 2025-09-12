import { requestUrl } from 'obsidian';
import MeshAIPlugin from '../main';
import { debugLog } from '../utils/MeshUtils';
import { YoutubeTranscript } from 'youtube-transcript';

export class YoutubeProvider {
  private plugin: MeshAIPlugin;
  private static readonly USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)';

  constructor(plugin: MeshAIPlugin) {
    this.plugin = plugin;
    debugLog(this.plugin, 'Initializing YoutubeProvider');
  }

  async getTranscript(url: string): Promise<string> {
    debugLog(this.plugin, `[getTranscript] Attempting to fetch transcript for URL: ${url}`);
    try {
      const videoId = this.extractVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL, cannot extract video ID');
      }

      // 0) Fabric primary method: attempt local yt-dlp if available
      let segments = await this.fetchViaYtDlp(videoId, 'en');
      if (!segments || segments.length === 0) {
        segments = await this.fetchViaYtDlp(videoId);
      }

      // 1) Fabric-like approach via youtube-transcript library (with CORS-safe fetch shim)
      if (!segments || segments.length === 0) {
        segments = await this.fetchViaLibraryPatched(videoId, 'en');
      }
      if (!segments || segments.length === 0) {
        segments = await this.fetchViaLibraryPatched(videoId);
      }

      // 2) Watch-page captions parsing via requestUrl
      if (!segments || segments.length === 0) {
        segments = await this.fetchTranscriptViaObsidian(videoId, 'en');
        if (!segments || segments.length === 0) {
          segments = await this.fetchTranscriptViaObsidian(videoId);
        }
      }

      // 3) TimedText preferred listing with translation fallback
      if (!segments || segments.length === 0) {
        segments = await this.fetchViaTimedTextPreferred(videoId);
      }

      // 4) Final fallback: direct timedtext by common English variants (manual and ASR)
      if (!segments || segments.length === 0) {
        const fallbackLangs = ['en', 'en-US', 'en-GB'];
        for (const lang of fallbackLangs) {
          segments = await this.fetchTranscriptViaTimedText(videoId, lang, false);
          if (segments && segments.length > 0) break;
          segments = await this.fetchTranscriptViaTimedText(videoId, lang, true);
          if (segments && segments.length > 0) break;
        }
      }

      if (!segments || segments.length === 0) {
        throw new Error('No transcript found for this video');
      }

      const fullTranscript = segments.map((s) => s.text).join(' ').trim();
      debugLog(this.plugin, `[getTranscript] Transcript fetched successfully. Length: ${fullTranscript.length}`);
      return fullTranscript;
    } catch (error) {
      debugLog(this.plugin, `[getTranscript] Error fetching YouTube transcript: ${error}`);
      throw error;
    }
  }

  private async fetchTranscriptViaObsidian(videoId: string, lang?: string): Promise<Array<{ text: string; duration: number; offset: number; lang?: string }>> {
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const headers: Record<string, string> = { 'User-Agent': YoutubeProvider.USER_AGENT };
    if (lang) headers['Accept-Language'] = lang;

    // Fetch video HTML via Obsidian requestUrl to avoid CORS
    const pageResp = await requestUrl({ url: pageUrl, headers });
    const body = pageResp.text;

    const splitted = body.split('"captions":');
    if (splitted.length <= 1) {
      if (body.includes('class="g-recaptcha"')) {
        throw new Error('Rate limited by YouTube while fetching transcript');
      }
      if (!body.includes('"playabilityStatus":')) {
        throw new Error('This video is unavailable');
      }
      throw new Error('Transcripts are disabled for this video');
    }

    let captions: any | undefined;
    try {
      const jsonSlice = splitted[1].split(',"videoDetails')[0].replace('\n', '');
      const parsed = JSON.parse(jsonSlice);
      captions = parsed['playerCaptionsTracklistRenderer'];
    } catch (e) {
      // If parsing fails, treat as disabled/unavailable
      throw new Error('Failed to parse captions data from YouTube');
    }

    if (!captions) {
      throw new Error('Transcripts are disabled for this video');
    }
    if (!('captionTracks' in captions)) {
      throw new Error('No transcript available for this video');
    }

    const tracks = captions.captionTracks as Array<{ baseUrl: string; languageCode: string }>;
    let selected = tracks[0];
    if (lang && tracks.some(t => t.languageCode === lang)) {
      selected = tracks.find(t => t.languageCode === lang)!;
    }

    const transcriptResp = await requestUrl({ url: selected.baseUrl, headers });
    const xml = transcriptResp.text;
    return this.parseTranscriptXml(xml, selected.languageCode);
  }

  extractVideoId(url: string): string | null {
    const pattern = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(pattern);
    return match ? match[1] : null;
  }

  private parseTranscriptXml(xml: string, languageCode?: string): Array<{ text: string; duration: number; offset: number; lang?: string }> {
    const results: Array<{ text: string; duration: number; offset: number; lang?: string }> = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const nodes = doc.getElementsByTagName('text');
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes.item(i)!;
        const start = parseFloat(el.getAttribute('start') || '0');
        const dur = parseFloat(el.getAttribute('dur') || '0');
        const text = (el.textContent || '').trim();
        results.push({ text, duration: dur, offset: start, lang: languageCode });
      }
    } catch (e) {
      const re = /<text start=\"([^\"]*)\" dur=\"([^\"]*)\">([\s\S]*?)<\/text>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null) {
        results.push({ text: m[3], duration: parseFloat(m[2]), offset: parseFloat(m[1]), lang: languageCode });
      }
    }
    return results;
  }

  private async fetchTranscriptViaTimedText(videoId: string, lang: string, asr: boolean): Promise<Array<{ text: string; duration: number; offset: number; lang?: string }>> {
    const params = new URLSearchParams({ v: videoId, lang });
    if (asr) params.set('kind', 'asr');
    const url = `https://video.google.com/timedtext?${params.toString()}`;
    const headers: Record<string, string> = { 'User-Agent': YoutubeProvider.USER_AGENT, 'Accept-Language': lang };
    const resp = await requestUrl({ url, headers });
    const xml = resp.text || '';
    if (!xml.includes('<transcript') && !xml.includes('<text')) {
      return [];
    }
    return this.parseTranscriptXml(xml, lang);
  }

  private async fetchViaLibraryPatched(videoId: string, lang?: string): Promise<Array<{ text: string; duration: number; offset: number; lang?: string }>> {
    const originalFetch = (globalThis as any).fetch;
    try {
      (globalThis as any).fetch = async (input: any, init?: any) => {
        const url = typeof input === 'string' ? input : input.url;
        const headers: Record<string, string> = { 'User-Agent': YoutubeProvider.USER_AGENT };
        if (init && init.headers) {
          const h = init.headers;
          if (Array.isArray(h)) {
            for (const [k, v] of h) headers[k] = v as string;
          } else if (h && typeof h === 'object') {
            Object.assign(headers, h as Record<string, string>);
          }
        }
        const resp = await requestUrl({ url, method: init?.method || 'GET', headers, body: init?.body });
        return {
          ok: resp.status >= 200 && resp.status < 300,
          status: resp.status,
          async text() { return resp.text; }
        } as any;
      };

      const data = await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : undefined);
      if (!data || data.length === 0) return [];
      return data.map(d => ({ text: d.text, duration: d.duration, offset: d.offset, lang }));
    } catch (_e) {
      return [];
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  }

  private async fetchViaYtDlp(videoId: string, lang?: string): Promise<Array<{ text: string; duration: number; offset: number; lang?: string }>> {
    try {
      // Obsidian desktop runs in Electron with Node integration; attempt to require child_process dynamically
      const cp = (window as any).require ? (window as any).require('child_process') : undefined;
      if (!cp) return [];

      // Determine yt-dlp binary
      const path = (window as any).require('path');
      const os = (window as any).require('os');
      const fs = (window as any).require('fs');
      const configuredBin: string = (this.plugin.settings as any).youtubeYtDlpPath;
      const candidateBins = [configuredBin, 'yt-dlp', '/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp'].filter(Boolean) as string[];
      let bin: string | undefined;
      for (const cand of candidateBins) {
        try {
          cp.execFileSync(cand, ['--version'], { stdio: 'ignore' });
          bin = cand;
          break;
        } catch {}
      }
      if (!bin) return [];

      const args: string[] = [
        '--write-auto-subs',
        '--skip-download',
        '--sub-format', 'vtt',
        '--quiet',
        '--no-warnings'
      ];
      if (lang) {
        const short = lang.length > 2 ? lang.slice(0, 2) : lang;
        const langOpts = `${lang},${short}.*,${short}`;
        args.push('--sub-langs', langOpts);
      }
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const tmpDir = os.tmpdir();
      const out = path.join(tmpDir, `mesh-ytdlp-${videoId}-%(title)s.%(ext)s`);
      args.push('-o', out);
      args.push(url);

      // Run yt-dlp
      cp.execFileSync(bin, args, { stdio: 'ignore' });

      // Find VTT files in tmpDir
      const files: string[] = fs.readdirSync(tmpDir)
        .filter((f: string) => f.includes(`mesh-ytdlp-${videoId}`) && f.toLowerCase().endsWith('.vtt'))
        .map((f: string) => path.join(tmpDir, f));
      if (files.length === 0) return [];

      // Read first VTT and convert to plain text segments
      const content = fs.readFileSync(files[0], 'utf8');
      const lines = content.split(/\r?\n/);
      const segments: Array<{ text: string; duration: number; offset: number; lang?: string }> = [];
      let lastStart = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'WEBVTT' || trimmed.startsWith('NOTE') || trimmed.includes('-->')) {
          // Timestamp lines set lastStart
          if (trimmed.includes('-->')) {
            const parts = trimmed.split(' --> ');
            if (parts[0]) {
              const t = parts[0].split('.')[0];
              const parts2 = t.split(':').map((x: string) => parseInt(x, 10) || 0);
              lastStart = parts2.length === 3 ? (parts2[0] * 3600 + parts2[1] * 60 + parts2[2]) : (parts2[0] * 60 + parts2[1]);
            }
          }
          continue;
        }
        // Clean VTT tags like <c> and </c>
        const text = trimmed.replace(/<[^>]*>/g, '');
        if (text) segments.push({ text, duration: 0, offset: lastStart, lang });
      }
      // Cleanup files
      for (const f of files) {
        try { fs.unlinkSync(f); } catch {}
      }
      return segments;
    } catch {
      return [];
    }
  }

  private async fetchViaTimedTextPreferred(videoId: string): Promise<Array<{ text: string; duration: number; offset: number; lang?: string }>> {
    const tracks = await this.listTimedTextTracks(videoId);
    if (!tracks || tracks.length === 0) return [];

    // Preference order: English manual, English ASR, any manual, any ASR
    const isEnglish = (code?: string) => code === 'en' || code === 'en-US' || code === 'en-GB';
    const manuals = tracks.filter(t => t.kind !== 'asr');
    const asrs = tracks.filter(t => t.kind === 'asr');

    const pick =
      manuals.find(t => isEnglish(t.lang_code)) ||
      asrs.find(t => isEnglish(t.lang_code)) ||
      manuals[0] ||
      asrs[0];
    if (!pick) return [];

    // Try native language; if not English, try translation to English
    let segs = await this.fetchTimedTextByTrack(videoId, pick);
    if ((!segs || segs.length === 0) && isEnglish(pick.lang_code)) {
      return [];
    }
    if (!isEnglish(pick.lang_code)) {
      const translated = await this.fetchTimedTextByTrack(videoId, pick, 'en');
      if (translated && translated.length > 0) return translated;
    }
    return segs || [];
  }

  private async listTimedTextTracks(videoId: string): Promise<Array<{ lang_code: string; name?: string; vss_id?: string; kind?: string }>> {
    const url = `https://video.google.com/timedtext?type=list&v=${encodeURIComponent(videoId)}`;
    const headers: Record<string, string> = { 'User-Agent': YoutubeProvider.USER_AGENT };
    const resp = await requestUrl({ url, headers });
    const xml = resp.text || '';
    if (!xml.includes('<transcript_list')) return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const trackEls = Array.from(doc.getElementsByTagName('track'));
    return trackEls.map(el => ({
      lang_code: el.getAttribute('lang_code') || '',
      name: el.getAttribute('name') || undefined,
      vss_id: el.getAttribute('vss_id') || undefined,
      kind: el.getAttribute('kind') || undefined,
    })).filter(t => t.lang_code);
  }

  private async fetchTimedTextByTrack(
    videoId: string,
    track: { lang_code: string; name?: string; vss_id?: string; kind?: string },
    translateToLang?: string
  ): Promise<Array<{ text: string; duration: number; offset: number; lang?: string }>> {
    const params = new URLSearchParams({ v: videoId, lang: track.lang_code });
    if (track.kind === 'asr') params.set('kind', 'asr');
    if (track.name) params.set('name', track.name);
    if (translateToLang) params.set('tlang', translateToLang);
    const url = `https://video.google.com/timedtext?${params.toString()}`;
    const headers: Record<string, string> = { 'User-Agent': YoutubeProvider.USER_AGENT };
    const resp = await requestUrl({ url, headers });
    const xml = resp.text || '';
    if (!xml.includes('<transcript') && !xml.includes('<text')) {
      return [];
    }
    return this.parseTranscriptXml(xml, translateToLang || track.lang_code);
  }
}