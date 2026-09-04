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
  estDistanceKm: number;
  estFare: number;
  /** Alış noktasının ülkesi (eski kayıtlarda null) */
  country?: CountryCode | null;
  finalFare: number | null;
  cancelReason: string | null;
  passengerRating: number | null;
  driverRating: number | null;
  requestedAt: string;
  completedAt: string | null;
  driver: RideDriver | null;
  passenger: { id: number; name: string; phone: string };
}

export interface RideOffer {
  rideId: number;
  pickup: GeoPoint;
  drop: GeoPoint;
  estDistanceKm: number;
  estFare: number;
  pickupDistanceKm: number;
}

/** Üyeliksiz harita için anonim sürücü konumu (~100 m hassasiyet). */
export interface NearbyDriver {
  lat: number;
  lng: number;
  vehicleModel: string;
  distanceKm: number;
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
}
