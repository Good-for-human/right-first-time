/**
 * DataFetchAgent
 *
 * Responsibility: Ingest raw product listing data from Amazon / TP-Link
 * via the Tinyfish API, then normalize into the RawListing schema.
 *
 * Input:  Task (asin, url, category)
 * Output: FetchResultMessage
 */

import type { Task, FetchResultMessage, RawListing } from '@/types';
import { fetchListingByAsin } from '@/services/tinyfish';

// Mock data used when no API key is configured
export const MOCK_RAW_LISTING: RawListing = {
  title: 'TP-Link WiFi 6 Router AX5400 Smart WiFi Router (Archer AX73) – Dual Band Gigabit Router, Long Range Coverage, Supports VPN Server/Client, Works with Alexa, OneMesh Compatible',
  bullets: [
    'Gigabit WiFi for 8K Streaming – 5400 Mbps WiFi for faster browsing, streamings, and downloading, all at the same time.',
    'Fully Featured Wi-Fi 6 – Equips with the top structure of 4T4R and HE160 on the 5 GHz band to enable 4.8 Gbps ultra-fast connection.',
    'Connect 200+ Devices – Supports MU-MIMO and OFDMA to reduce congestion and quadruple the average throughput.',
    'Extensive Coverage – Enjoy stable Wi-Fi connections, even in the kitchen and bedroom. High-Power FEM, 6× Antennas, Beamforming, and 4T4R structures combine to adapt WiFi coverage.',
  ],
  description: "Welcome to the next generation of Wi-Fi with the Archer AX73. This amazing router gives you ultra-fast speeds up to 5400Mbps. It's the best router for your home. Buy it today and experience no more buffering. Works perfectly with TP-Link OneMesh extenders.",
  specs: { Brand: 'TP-Link', 'Model Name': 'Archer AX73', 'Wireless Standard': '802.11ax' },
};

export class DataFetchAgent {
  constructor(private readonly tinyfishApiKey: string) {}

  async run(task: Task): Promise<FetchResultMessage> {
    let rawListing: RawListing;
    const sourceUrl = task.url ?? `https://www.amazon.com/dp/${task.asin}`;

    if (!this.tinyfishApiKey) {
      // Fall back to mock data when no key is set
      console.warn('[DataFetchAgent] No Tinyfish API key — using mock data');
      rawListing = MOCK_RAW_LISTING;
    } else {
      rawListing = await fetchListingByAsin(task.asin, this.tinyfishApiKey, task.url);
    }

    return {
      taskId: task.id,
      rawListing,
      fetchedAt: new Date().toISOString(),
      sourceUrl,
    };
  }
}
