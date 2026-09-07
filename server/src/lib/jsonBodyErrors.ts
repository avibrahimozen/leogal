import type { ErrorRequestHandler } from 'express';

/**
 * express.json() hatalarını JSON'a çevirir; böylece çok büyük (413) veya bozuk
 * (400) gövdeler Express'in varsayılan HTML hata sayfası (ve geliştirmede yığın
 * izi) yerine {error} döner. body-parser dışı hatalar sonraki işleyiciye
 * aktarılır (next(err)); yanıt başlamışsa hiçbir şey yapmaz — bu sayede genel
 * bir hata işleyiciyle birlikte güvenle kullanılabilir.
 */
export function jsonBodyErrors(): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const type = typeof err === 'object' && err !== null ? (err as { type?: unknown }).type : undefined;
    if (type === 'entity.too.large') {
      res.status(413).json({ error: 'İstek gövdesi çok büyük' });
      return;
    }
    if (type === 'entity.parse.failed' || type === 'charset.unsupported' || type === 'encoding.unsupported') {
      res.status(400).json({ error: 'Geçersiz JSON' });
      return;
    }
    next(err);
  };
}
