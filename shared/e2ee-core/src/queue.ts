// Cihaz başı seri iş kuyruğu (sözleşme §1.7): aynı durum nesnesi üzerindeki işler art arda çalışır.
// Neden: MLS durumu "oku, değiştir, yaz" ile ilerler; iki eşzamanlı işlem aynı eski durumdan türeyip
// birinin sonucunu sessizce ezer. Kuyruk grup başına değil, durum nesnesi (cihaz) başına tektir.

export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()

  /** `task` öncekiler bitince çalışır. Önceki iş hata verse bile kuyruk tıkanmaz. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task)
    this.tail = result.catch(() => undefined)
    return result
  }
}
