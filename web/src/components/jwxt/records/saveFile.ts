/**
 * 把生成的文件交给用户：手机上先走系统分享面板（方便存到“文件”或发给自己），
 * 分享不了或在电脑上就按普通下载处理。
 */
export async function saveFile(blob: Blob, fileName: string) {
  const file = new File([blob], fileName, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })
    && window.matchMedia?.("(pointer: coarse)").matches) {
    try {
      await nav.share({ files: [file], title: fileName });
      return "shared" as const;
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return "cancelled" as const;
      /* 分享不了就退回下载 */
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded" as const;
}
