import { BuildConfig, BuildContext, HydrateOptions, Url } from '../../util/interfaces';
import { pathJoin } from '../util';


export function inlineExternalAssets(config: BuildConfig, ctx: BuildContext, opts: HydrateOptions, doc: Document) {
  const linkElements = doc.querySelectorAll('link[href][rel="stylesheet"]') as any;
  for (var i = 0; i < linkElements.length; i++) {
    inlineStyle(config, ctx, opts, doc, linkElements[i] as any);
  }

  const scriptElements = doc.querySelectorAll('script[src]') as any;
  for (i = 0; i < scriptElements.length; i++) {
    inlineScript(config, ctx, opts, scriptElements[i] as any);
  }
}


function inlineStyle(config: BuildConfig, ctx: BuildContext, opts: HydrateOptions, doc: Document, linkElm: HTMLLinkElement) {
  const content = getAssetContent(config, ctx, opts, linkElm.href);
  if (!content) {
    return;
  }

  const styleElm = doc.createElement('style');
  styleElm.innerHTML = content;

  linkElm.parentNode.insertBefore(styleElm, linkElm);
  linkElm.parentNode.removeChild(linkElm);
}


function inlineScript(config: BuildConfig, ctx: BuildContext, opts: HydrateOptions, scriptElm: HTMLScriptElement) {
  const content = getAssetContent(config, ctx, opts, scriptElm.src);
  if (!content) {
    return;
  }

  scriptElm.innerHTML = content;
  scriptElm.removeAttribute('src');
}


function getAssetContent(config: BuildConfig, ctx: BuildContext, opts: HydrateOptions, assetUrl: string) {
  // figure out the url's so we can check the hostnames
  const fromUrl = config.sys.url.parse(opts.url);
  const toUrl = config.sys.url.parse(assetUrl);

  if (fromUrl.hostname !== toUrl.hostname) {
    // not the same hostname, so we wouldn't have the file content
    return null;
  }

  // figure out the local file path
  const filePath = getFilePathFromUrl(config, fromUrl, toUrl);

  // first see if we already have cached file text
  // this would happen if it's being prerendered
  let content = ctx.filesToWrite[filePath];

  if (!content) {
    // doesn't look like we've got a copy cached to be written
    // check if we cached it in our appFiles object
    content = ctx.appFiles[filePath];
  }

  if (!content) {
    // doesn't look like we've got it cached in app files
    try {
      // try looking it up directly
      content = config.sys.fs.readFileSync(filePath, 'utf-8');

      // cool we found it, cache it for later
      ctx.appFiles[filePath] = content;

    } catch (e) {
      // something is up, don't bother trying to inline the content
      config.logger.debug(`getAssetContent error`, e);
    }
  }

  if (!content) {
    // never found the content for this file
    return null;
  }

  // rough estimate of size
  const fileSize = content.length;

  if (fileSize > opts.inlineAssetsMaxSize) {
    // welp, considered too big, don't inline
    return null;
  }

  return content;
}


export function getFilePathFromUrl(config: BuildConfig, fromUrl: Url, toUrl: Url) {
  const resolvedUrl = '.' + config.sys.url.resolve(fromUrl.pathname, toUrl.pathname);
  return pathJoin(config, config.wwwDir, resolvedUrl);
}
