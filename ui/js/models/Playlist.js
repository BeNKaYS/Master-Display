/**
 * Playlist - Oynatma Listesi Yönetimi Veri Modeli
 */

import { MediaItem } from './MediaItem.js';

export class Playlist {
  constructor({
    id = null,
    title = 'Tören Akışı',
    items = [],
    currentIndex = -1,
    loop = false,
    updatedAt = Date.now()
  } = {}) {
    this.id = id || `pl_${Date.now()}`;
    this.title = title;
    this.items = items.map(item => item instanceof MediaItem ? item : new MediaItem(item));
    this.currentIndex = currentIndex;
    this.loop = loop;
    this.updatedAt = updatedAt;
  }

  addItem(mediaItem, targetIndex = null) {
    const item = mediaItem instanceof MediaItem ? mediaItem : new MediaItem(mediaItem);
    if (targetIndex !== null && targetIndex >= 0 && targetIndex <= this.items.length) {
      this.items.splice(targetIndex, 0, item);
    } else {
      this.items.push(item);
    }
    this.updatedAt = Date.now();
    return item;
  }

  removeItem(indexOrId) {
    let index = -1;
    if (typeof indexOrId === 'number') {
      index = indexOrId;
    } else {
      index = this.items.findIndex(i => i.id === indexOrId);
    }

    if (index >= 0 && index < this.items.length) {
      const removed = this.items.splice(index, 1)[0];
      
      // Eğer silinen öğe şu an oynatılıyorsa durumu güncelle
      if (this.currentIndex === index) {
        if (this.items.length === 0) {
          this.currentIndex = -1;
        } else if (this.currentIndex >= this.items.length) {
          this.currentIndex = this.items.length - 1;
        }
      } else if (this.currentIndex > index) {
        this.currentIndex--;
      }

      this.updatedAt = Date.now();
      return removed;
    }
    return null;
  }

  moveItem(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.items.length || toIndex < 0 || toIndex >= this.items.length) {
      return false;
    }
    const [moved] = this.items.splice(fromIndex, 1);
    this.items.splice(toIndex, 0, moved);

    // Aktif indeksin pozisyonunu koru
    if (this.currentIndex === fromIndex) {
      this.currentIndex = toIndex;
    } else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
      this.currentIndex--;
    } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
      this.currentIndex++;
    }

    this.updatedAt = Date.now();
    return true;
  }

  getCurrentItem() {
    if (this.currentIndex >= 0 && this.currentIndex < this.items.length) {
      return this.items[this.currentIndex];
    }
    return null;
  }

  getItem(index) {
    return this.items[index] || null;
  }

  setCurrentIndex(index) {
    if (index >= -1 && index < this.items.length) {
      this.currentIndex = index;
      this.updatedAt = Date.now();
      return true;
    }
    return false;
  }

  next() {
    if (this.items.length === 0) return null;
    
    // Eğer slayt sunumu oynatılıyorsa ve bir sonraki slayt sayfası varsa önce slaytı ilerlet
    const current = this.getCurrentItem();
    if (current && current.type === 'presentation' && current.slides.length > 0) {
      if (current.activeSlide < current.slides.length - 1) {
        current.activeSlide++;
        this.updatedAt = Date.now();
        return current;
      }
    }

    if (this.currentIndex + 1 < this.items.length) {
      this.currentIndex++;
      const nextItem = this.getCurrentItem();
      if (nextItem && nextItem.type === 'presentation') {
        nextItem.activeSlide = 0;
      }
      this.updatedAt = Date.now();
      return nextItem;
    } else if (this.loop) {
      this.currentIndex = 0;
      const nextItem = this.getCurrentItem();
      if (nextItem && nextItem.type === 'presentation') {
        nextItem.activeSlide = 0;
      }
      this.updatedAt = Date.now();
      return nextItem;
    }
    return null;
  }

  prev() {
    if (this.items.length === 0) return null;

    // Eğer slayt sunumu oynatılıyorsa ve önceki slayt sayfası varsa geri al
    const current = this.getCurrentItem();
    if (current && current.type === 'presentation' && current.slides.length > 0) {
      if (current.activeSlide > 0) {
        current.activeSlide--;
        this.updatedAt = Date.now();
        return current;
      }
    }

    if (this.currentIndex - 1 >= 0) {
      this.currentIndex--;
      const prevItem = this.getCurrentItem();
      if (prevItem && prevItem.type === 'presentation') {
        prevItem.activeSlide = Math.max(0, prevItem.slides.length - 1);
      }
      this.updatedAt = Date.now();
      return prevItem;
    }
    return null;
  }

  clear() {
    this.items = [];
    this.currentIndex = -1;
    this.updatedAt = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      items: this.items.map(item => item.toJSON()),
      currentIndex: this.currentIndex,
      loop: this.loop,
      updatedAt: this.updatedAt
    };
  }

  static fromJSON(json) {
    if (typeof json === 'string') {
      json = JSON.parse(json);
    }
    return new Playlist({
      ...json,
      items: (json.items || []).map(i => MediaItem.fromJSON(i))
    });
  }
}
