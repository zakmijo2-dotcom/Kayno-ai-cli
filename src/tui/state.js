export class RingBuffer {
  constructor(limit = 50) {
    this.limit = limit;
    this.items = [];
  }
  push(item) {
    this.items.push(item);
    if (this.items.length > this.limit) this.items.splice(0, this.items.length - this.limit);
    return item;
  }
  toArray() {
    return this.items.slice();
  }
}
