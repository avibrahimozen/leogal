export type Role = 'passenger' | 'driver' | 'admin';

/** Hizmet ülkesi: Kuzey Kıbrıs veya Türkiye */
export type CountryCode = 'KKTC' | 'TR';

export type RideStatus =
  | 'requested'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface DriverProfile {
  licenseNo: string;
  vehiclePlate: string;
  vehicleModel: string;
  city: string;
  country?: CountryCode;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  isOnline: boolean;
  rating: number | null;
}

export interface User {
  id: number;
  phone: string;
  name: string;
  role: Role;
  driver?: DriverProfile;
  /** Yolcu hesabı: sürücülerin verdiği puanların ortalaması */
  passenger?: { rating: number | null; ratingCount: number };
}

export interface GeoPoint {
  lat: number;
  lng: number;
  address: string;
}

export interface RideDriver {
  id: number;
  name: string;
  phone: string;
  vehiclePlate: string;
  vehicleModel: string;
  rating: number | null;
  lat: number | null;
  lng: number | null;
}

export interface Ride {
  id: number;
  status: RideStatus;
  pickup: GeoPoint;
  drop: GeoPoint;
  /** Ara duraklar (en fazla 5); eski kayıtlarda boş */
  stops?: GeoPoint[];
  estDistanceKm: number;
  estFare: number;
  /** Alış noktasının ülkesi (eski kayıtlarda null) */
  country?: CountryCode | null;
  finalFare: number | null;
  cancelReason: string | null;
  passengerRating: number | null;
  driverRating: number | null;
  /** Puanla bırakılan kısa yorumlar (isteğe bağlı) */
  passengerComment?: string | null;
  driverComment?: string | null;
  requestedAt: string;
  completedAt: string | null;
  driver: RideDriver | null;
  passenger: { id: number; name: string; phone: string; rating?: number | null; ratingCount?: number };
}

export interface RideOffer {
  rideId: number;
  pickup: GeoPoint;
  drop: GeoPoint;
  stops?: GeoPoint[];
  estDistanceKm: number;
  estFare: number;
  pickupDistanceKm: number;
  /** Yolcunun ortalama puanı (sürücülerin verdiği); henüz yoksa null */
  passengerRating?: number | null;
}

/** Ham koordinat (adres bilgisi olmadan) */
export type LatLng = { lat: number; lng: number };

/** Üyeliksiz harita için anonim sürücü konumu (~100 m hassasiyet). */
export interface NearbyDriver {
  /** Sunucunun ürettiği anonim ama kalıcı kimlik: yenilemeler arasında aynı taksiyi eşleyip kaydırarak taşımak için */
  id?: string;
  lat: number;
  lng: number;
  vehicleModel: string;
  distanceKm: number;
  /** Gidiş yönü (pusula derecesi, 0 = kuzey); bilinmiyorsa null */
  heading?: number | null;
}

/** POST /api/rides/estimate yanıtı */
export interface RideEstimate {
  distanceKm: number;
  fare: number;
  /** Yol rotasından gelen tahmini süre; rota alınamadıysa null */
  durationMin?: number | null;
  /** Mesafenin kaynağı: gerçek yol (osrm) ya da kuş uçuşu × yol çarpanı (straight) */
  route?: 'osrm' | 'straight';
  tariff?: { baseFare: number; perKm: number; minFare: number };
}

/** GET /api/public/route yanıtı: yol geometrisi, mesafe ve süre */
export interface RoadRoute {
  points: LatLng[];
  distanceKm: number;
  durationMin: number | null;
  source: 'osrm' | 'straight';
}

/** Sunucudan gelen `driver:location` olayı (yalnızca aktif çağrının yolcusuna) */
export interface DriverLocationPayload {
  rideId?: number;
  lat: number;
  lng: number;
  heading?: number | null;
}

export interface Earnings {
  rideCount: number;
  grossEarnings: number;
  totalCommission: number;
  netEarnings: number;
  commissionDue: number;
  ledger: Array<{
    id: number;
    rideId: number | null;
    type: 'commission' | 'settlement';
    amount: number;
    note: string | null;
    createdAt: string;
  }>;
}

/**
 * Sunucudan gelen `ride:update` olayı. `rideId` ve `status` her zaman gelir;
 * `ride` nesnesi bazı iptal olaylarında (örn. zaman aşımı) bulunmaz.
 */
export interface RideUpdatePayload {
  rideId?: number;
  status?: RideStatus;
  ride?: Ride;
  cancelReason?: string | null;
  /** Sürücü iptal etti ve çağrı yeniden yayınlandı (yalnızca yolcuya) */
  reassigned?: boolean;
  previousDriverCancelled?: boolean;
  /** Yolcu durak listesini değiştirdi (ücret yeniden hesaplandı) */
  stopsChanged?: boolean;
}
