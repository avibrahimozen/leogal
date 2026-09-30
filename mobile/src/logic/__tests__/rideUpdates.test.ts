import type { Ride } from '../../types';
import { applyDriverRideUpdate, applyPassengerRideUpdate } from '../rideUpdates';

function makeRide(overrides: Partial<Ride> = {}): Ride {
  return {
    id: 7,
    status: 'accepted',
    pickup: { lat: 35.18, lng: 33.38, address: 'Mevcut Konum' },
    drop: { lat: 35.34, lng: 33.32, address: 'Girne Limanı' },
    estDistanceKm: 23,
    estFare: 665,
    finalFare: null,
    cancelReason: null,
    passengerRating: null,
    driverRating: null,
    requestedAt: '2026-09-04T10:00:00.000Z',
    completedAt: null,
    driver: {
      id: 2,
      name: 'Demo Sürücü',
      phone: '+905550000002',
      vehiclePlate: 'GM 100',
      vehicleModel: 'Toyota Corolla',
      rating: 4.7,
      lat: null,
      lng: null,
    },
    passenger: { id: 1, name: 'Demo Yolcu', phone: '+905550000001' },
    ...overrides,
  };
}

describe('applyPassengerRideUpdate', () => {
  it('sürücü iptalinde yeniden yayın: arama durumunda kalır ve uyarı ister', () => {
    const current = makeRide();
    const reassigned = makeRide({ status: 'requested', driver: null });
    const result = applyPassengerRideUpdate(current, {
      rideId: 7,
      status: 'requested',
      reassigned: true,
      previousDriverCancelled: true,
      ride: reassigned,
    });
    expect(result.ride).toEqual(reassigned);
    expect(result.ride?.status).toBe('requested');
    expect(result.event).toEqual({ type: 'reassigned' });
  });

  it('yeniden yayın olayı ride nesnesi olmadan gelse de aramaya döner', () => {
    const result = applyPassengerRideUpdate(makeRide(), { rideId: 7, status: 'requested', reassigned: true });
    expect(result.ride).toMatchObject({ id: 7, status: 'requested', driver: null });
    expect(result.event).toEqual({ type: 'reassigned' });
  });

  it("zaman aşımı iptali 'ride' nesnesi olmadan gelir: çökmez, uyarı ister", () => {
    const result = applyPassengerRideUpdate(makeRide({ status: 'requested', driver: null }), {
      rideId: 7,
      status: 'cancelled',
      cancelReason: 'no_driver',
    });
    expect(result).toEqual({ ride: null, event: { type: 'no_driver' } });
  });

  it('yolcunun kendi iptali sessizce kapanır', () => {
    const cancelled = makeRide({ status: 'cancelled', cancelReason: 'passenger_cancelled' });
    const result = applyPassengerRideUpdate(makeRide(), {
      rideId: 7,
      status: 'cancelled',
      cancelReason: 'passenger_cancelled',
      ride: cancelled,
    });
    expect(result).toEqual({ ride: null, event: null });
  });

  it("ara 'driver_cancelled' olayı kartı kapatmaz, aramaya döner (uyarı takip eden olayda)", () => {
    const result = applyPassengerRideUpdate(makeRide(), {
      rideId: 7,
      status: 'cancelled',
      cancelReason: 'driver_cancelled',
    });
    expect(result.ride).toMatchObject({ id: 7, status: 'requested', driver: null });
    expect(result.event).toBeNull();
  });

  it('tamamlanınca kart kapanır ve puanlama için çağrıyı döner', () => {
    const completed = makeRide({ status: 'completed', finalFare: 665 });
    const result = applyPassengerRideUpdate(makeRide({ status: 'in_progress' }), {
      rideId: 7,
      status: 'completed',
      ride: completed,
    });
    expect(result).toEqual({ ride: null, event: { type: 'completed', ride: completed } });
  });

  it('başka çağrıya ait olay yok sayılır', () => {
    const current = makeRide();
    const result = applyPassengerRideUpdate(current, { rideId: 99, status: 'cancelled', cancelReason: 'no_driver' });
    expect(result).toEqual({ ride: current, event: null });
  });

  it("ride payload'ı olmayan durum geçişinde status güncellenir", () => {
    const result = applyPassengerRideUpdate(makeRide(), { rideId: 7, status: 'arrived' });
    expect(result.ride).toMatchObject({ id: 7, status: 'arrived' });
    expect(result.event).toBeNull();
  });

  it('id veya status eksikse durum değişmez', () => {
    const current = makeRide();
    expect(applyPassengerRideUpdate(current, {})).toEqual({ ride: current, event: null });
    expect(applyPassengerRideUpdate(null, { reassigned: true })).toEqual({ ride: null, event: null });
  });
});

describe('applyDriverRideUpdate', () => {
  it('yolcu iptalinde çağrı kapanır ve uyarı ister', () => {
    const result = applyDriverRideUpdate(makeRide(), {
      rideId: 7,
      status: 'cancelled',
      cancelReason: 'passenger_cancelled',
    });
    expect(result).toEqual({ ride: null, event: 'passenger_cancelled' });
  });

  it('sürücünün kendi iptalinde uyarı vermez', () => {
    const result = applyDriverRideUpdate(makeRide(), {
      rideId: 7,
      status: 'cancelled',
      cancelReason: 'driver_cancelled',
    });
    expect(result).toEqual({ ride: null, event: null });
  });

  it('elimizde olmayan çağrının iptali sessiz kalır', () => {
    expect(applyDriverRideUpdate(null, { rideId: 7, status: 'cancelled', cancelReason: 'passenger_cancelled' })).toEqual(
      { ride: null, event: null },
    );
    const other = makeRide({ id: 3 });
    expect(applyDriverRideUpdate(other, { rideId: 7, status: 'cancelled' })).toEqual({ ride: other, event: null });
  });

  it('aktif çağrı yokken kabul olayı çağrıyı yükler', () => {
    const accepted = makeRide();
    expect(applyDriverRideUpdate(null, { rideId: 7, status: 'accepted', ride: accepted })).toEqual({
      ride: accepted,
      event: null,
    });
  });

  it('tamamlanınca veya yeniden yayına düşünce kart kapanır', () => {
    expect(applyDriverRideUpdate(makeRide({ status: 'in_progress' }), { rideId: 7, status: 'completed' })).toEqual({
      ride: null,
      event: null,
    });
    expect(applyDriverRideUpdate(makeRide(), { rideId: 7, status: 'requested' })).toEqual({ ride: null, event: null });
  });
});

describe('yolculuk sırasında bitirme (ücretsiz)', () => {
  it('yolcu: sürücü bitirince kart kapanır ve uyarı ister', () => {
    const result = applyPassengerRideUpdate(makeRide({ status: 'in_progress' }), {
      rideId: 7,
      status: 'cancelled',
      cancelReason: 'driver_ended',
    });
    expect(result.ride).toBeNull();
    expect(result.event).toEqual({ type: 'driver_ended' });
  });

  it('yolcu: kendi bitirmesi sessizce kapanır', () => {
    const result = applyPassengerRideUpdate(makeRide({ status: 'in_progress' }), {
      rideId: 7,
      status: 'cancelled',
      cancelReason: 'passenger_ended',
    });
    expect(result).toEqual({ ride: null, event: null });
  });

  it('sürücü: yolcu bitirince çağrı kapanır ve uyarı ister', () => {
    const result = applyDriverRideUpdate(makeRide({ status: 'in_progress' }), {
      rideId: 7,
      status: 'cancelled',
      cancelReason: 'passenger_ended',
    });
    expect(result).toEqual({ ride: null, event: 'passenger_ended' });
  });

  it('sürücü: kendi bitirmesinde uyarı vermez', () => {
    const result = applyDriverRideUpdate(makeRide({ status: 'in_progress' }), {
      rideId: 7,
      status: 'cancelled',
      cancelReason: 'driver_ended',
    });
    expect(result).toEqual({ ride: null, event: null });
  });
});
