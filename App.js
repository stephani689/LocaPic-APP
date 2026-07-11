import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  Image, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator,
  Linking,
  ScrollView,
  StatusBar,
  Modal,
  FlatList,
  Animated,
  Easing,
  Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const HISTORY_KEY = '@checkin_history';
const ONBOARDING_KEY = '@locapic_onboarding_seen';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    key: '1',
    emoji: '📍',
    title: 'Selamat Datang di LocaPic',
    desc: 'Abadikan setiap momen penting, lengkap dengan jejak lokasi tempat kamu berada.',
    colors: ['#4F46E5', '#7C3AED'],
  },
  {
    key: '2',
    emoji: '📸',
    title: 'Check-In Satu Tap Saja',
    desc: 'Ambil foto dari kamera atau galeri — lokasi GPS otomatis terkunci tanpa ribet.',
    colors: ['#4338CA', '#4F46E5'],
  },
  {
    key: '3',
    emoji: '🔥',
    title: 'Bangun Streak Harianmu',
    desc: 'Lihat riwayat check-in dalam timeline yang rapi dan pertahankan progres harianmu.',
    colors: ['#6D28D9', '#4F46E5'],
  },
];

// Layar perkenalan pertama kali app dibuka — first impression pengguna
function OnboardingScreen({ onFinish }) {
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  const goToSlide = (i) => {
    listRef.current?.scrollToIndex({ index: i, animated: true });
    setIndex(i);
  };

  const handleNext = () => {
    if (index < SLIDES.length - 1) {
      goToSlide(index + 1);
    } else {
      onFinish();
    }
  };

  const current = SLIDES[index];

  return (
    <LinearGradient colors={current.colors} style={styles.onboardRoot}>
      <StatusBar barStyle="light-content" />
      <TouchableOpacity style={styles.skipButton} onPress={onFinish} activeOpacity={0.7}>
        <Text style={styles.skipButtonText}>Lewati</Text>
      </TouchableOpacity>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <FlatList
          ref={listRef}
          data={SLIDES}
          horizontal
          pagingEnabled
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <View style={[styles.onboardSlide, { width: SCREEN_WIDTH }]}>
              <View style={styles.onboardIconCircle}>
                <Text style={styles.onboardEmoji}>{item.emoji}</Text>
              </View>
              <Text style={styles.onboardTitle}>{item.title}</Text>
              <Text style={styles.onboardDesc}>{item.desc}</Text>
            </View>
          )}
        />
      </Animated.View>

      <View style={styles.onboardFooter}>
        <View style={styles.dotsRow}>
          {SLIDES.map((s, i) => (
            <View
              key={s.key}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.onboardNextBtn} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.onboardNextBtnText}>
            {index === SLIDES.length - 1 ? 'Mulai Sekarang' : 'Lanjut'}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

export default function App() {
  const [imageUri, setImageUri] = useState(null);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [history, setHistory] = useState([]);
  const [streak, setStreak] = useState(0);
  const [detailItem, setDetailItem] = useState(null);
  const [celebrate, setCelebrate] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(null); // null = belum dicek

  // Nilai animasi: pulsa badge streak & celebration burst
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const celebrateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animasi pulsa terus-menerus di badge streak
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.12,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Ambil data dari AsyncStorage saat aplikasi pertama kali dibuka (Persistensi)
  useEffect(() => {
    loadSavedData();
  }, []);

  const loadSavedData = async () => {
    try {
      const savedPhoto = await AsyncStorage.getItem('@user_photo');
      const savedLocation = await AsyncStorage.getItem('@user_location');
      const savedHistory = await AsyncStorage.getItem(HISTORY_KEY);
      const onboardingSeen = await AsyncStorage.getItem(ONBOARDING_KEY);
      
      if (savedPhoto) setImageUri(savedPhoto);
      if (savedLocation) setLocation(JSON.parse(savedLocation));
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        setHistory(parsed);
        setStreak(calculateStreak(parsed));
      }
      setShowOnboarding(onboardingSeen !== 'true');
    } catch (error) {
      setShowOnboarding(false);
      Alert.alert("Error", "Gagal memuat data pencatatan sebelumnya.");
    }
  };

  // Tandai onboarding sudah dilihat, agar tidak muncul lagi di pembukaan berikutnya
  const finishOnboarding = async (replay = false) => {
    if (!replay) {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    }
    setShowOnboarding(false);
  };

  // Menghitung berapa hari beruntun (streak) user melakukan check-in
  const calculateStreak = (items) => {
    if (!items || items.length === 0) return 0;

    const dateStrings = [...new Set(items.map(i => new Date(i.timestamp).toDateString()))]
      .map(d => new Date(d))
      .sort((a, b) => b - a);

    let count = 0;
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    for (let i = 0; i < dateStrings.length; i++) {
      const diffDays = Math.round((cursor - dateStrings[i]) / 86400000);
      if (diffDays === 0 || diffDays === 1) {
        count += 1;
        cursor = dateStrings[i];
      } else {
        break;
      }
    }
    return count;
  };

  // Simpan satu entri check-in baru ke riwayat, lalu trigger animasi perayaan
  const addToHistory = async (uri, coords) => {
    const entry = {
      id: Date.now().toString(),
      uri,
      latitude: coords.latitude,
      longitude: coords.longitude,
      timestamp: Date.now(),
    };
    const updated = [entry, ...history].slice(0, 30); // simpan maksimal 30 riwayat terakhir
    setHistory(updated);
    setStreak(calculateStreak(updated));
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    triggerCelebration();
  };

  // Animasi perayaan singkat setiap kali check-in berhasil
  const triggerCelebration = () => {
    setCelebrate(true);
    celebrateAnim.setValue(0);
    Animated.timing(celebrateAnim, {
      toValue: 1,
      duration: 1400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setCelebrate(false));
  };

  // Fungsi untuk meminta izin dan membuka Kamera / Galeri
  const handleSelectImage = () => {
    Alert.alert(
      "Pilih Sumber Foto",
      "Silakan pilih untuk mengambil foto baru atau dari galeri.",
      [
        { text: "Kamera", onPress: openCamera },
        { text: "Galeri", onPress: openLibrary },
        { text: "Batal", style: "cancel" }
      ]
    );
  };

  // 1. Logika Kamera + Permission Flow
  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        "Izin Ditolak", 
        "Aplikasi butuh izin kamera. Buka pengaturan untuk mengaktifkan?",
        [
          { text: "Batal", style: "cancel" },
          { text: "Buka Pengaturan", onPress: () => Linking.openSettings() } // Level 2: Tombol Settings
        ]
      );
      return;
    }

    let result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setImageUri(uri);
      await AsyncStorage.setItem('@user_photo', uri);
      // Setiap kali ambil foto, otomatis perbarui lokasi juga (Gabungan Fitur)
      const coords = await getGeoLocation();
      if (coords) await addToHistory(uri, coords);
    }
  };

  // 2. Logika Galeri + Permission Flow
  const openLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert("Izin Ditolak", "Aplikasi membutuhkan izin galeri foto.");
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setImageUri(uri);
      await AsyncStorage.setItem('@user_photo', uri);
      const coords = await getGeoLocation();
      if (coords) await addToHistory(uri, coords);
    }
  };

  // 3. Logika GPS Lokasi + Permission Flow
  const getGeoLocation = async () => {
    setLoading(true);
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert("Izin GPS Ditolak", "Gagal mendapatkan koordinat karena tidak ada izin.");
      setLoading(false);
      return null;
    }

    try {
      let loc = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      };
      setLocation(coords);
      await AsyncStorage.setItem('@user_location', JSON.stringify(coords));
      return coords;
    } catch (error) {
      Alert.alert("Error GPS", "Gagal mengunci lokasi kamu. Pastikan GPS HP aktif.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 4. Buka di Google Maps via Linking (Level 2)
  const openInMaps = () => {
    if (!location) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
    Linking.openURL(url);
  };

  // 5. Reset Data (Tantangan Bonus Level 3)
  const handleReset = async () => {
    setImageUri(null);
    setLocation(null);
    setHistory([]);
    setStreak(0);
    await AsyncStorage.clear();
    Alert.alert("Sukses", "Data portfolio telah direset!");
  };

  // Sedang mengecek status onboarding — tampilkan layar netral sebentar
  if (showOnboarding === null) {
    return (
      <View style={styles.bootScreen}>
        <StatusBar barStyle="light-content" backgroundColor="#4F46E5" />
      </View>
    );
  }

  // First impression: layar perkenalan LocaPic, hanya muncul di pembukaan pertama
  if (showOnboarding) {
    return <OnboardingScreen onFinish={() => finishOnboarding(false)} />;
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#4F46E5" />

      {/* Header dengan gradient + aksen dekoratif, jadi "brand" yang kuat di paling atas */}
      <LinearGradient colors={['#4F46E5', '#7C3AED']} style={styles.header}>
        <View style={styles.headerBlobOne} />
        <View style={styles.headerBlobTwo} />
        <View style={styles.headerTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerEyebrow}>📍 PORTOFOLIO SISTEM INFORMASI</Text>
            <Text style={styles.headerTitle}>LocaPic</Text>
            <Text style={styles.headerSubtitle}>Check-in foto & lokasi dalam satu tap</Text>
          </View>
          <TouchableOpacity
            style={styles.aboutButton}
            onPress={() => setAboutVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.aboutButtonText}>ℹ️</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <LinearGradient
        colors={['#EEF2FF', '#F8FAFC']}
        style={{ flex: 1 }}
      >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Badge Streak Beruntun (animasi pulsa) */}
        {streak > 0 && (
          <Animated.View
            style={[styles.streakBadge, { transform: [{ scale: pulseAnim }] }]}
          >
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakText}>
              {streak} hari beruntun check-in!
            </Text>
          </Animated.View>
        )}

        {/* Kartu Foto */}
        <View style={styles.card}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.imagePreview} />
          ) : (
            <View style={[styles.imagePreview, styles.placeholder]}>
              <Text style={styles.placeholderIcon}>🖼️</Text>
              <Text style={styles.placeholderText}>Belum ada foto</Text>
            </View>
          )}

          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: imageUri ? '#22C55E' : '#CBD5E1' },
              ]}
            />
            <Text style={styles.statusPillText}>
              {imageUri ? 'Foto tersimpan' : 'Menunggu foto'}
            </Text>
          </View>
        </View>

        {/* Kartu Lokasi */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>LOKASI TERKINI</Text>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#4F46E5" />
              <Text style={styles.loadingText}>Mengunci lokasi kamu...</Text>
            </View>
          ) : location ? (
            <View>
              <View style={styles.coordRow}>
                <Text style={styles.coordLabel}>Latitude</Text>
                <Text style={styles.coordValue}>{location.latitude.toFixed(6)}</Text>
              </View>
              <View style={styles.coordRow}>
                <Text style={styles.coordLabel}>Longitude</Text>
                <Text style={styles.coordValue}>{location.longitude.toFixed(6)}</Text>
              </View>

              <TouchableOpacity style={styles.btnMaps} onPress={openInMaps} activeOpacity={0.8}>
                <Text style={styles.btnMapsText}>📍 Lihat di Google Maps</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.emptyLocationText}>
              Lokasi akan otomatis terekam saat kamu check-in.
            </Text>
          )}
        </View>

        {/* Tombol Utama */}
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={handleSelectImage}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>📸  Check-In Sekarang</Text>
        </TouchableOpacity>

        {/* Tombol Reset */}
        {(imageUri || location) && (
          <TouchableOpacity style={styles.btnReset} onPress={handleReset} activeOpacity={0.7}>
            <Text style={styles.btnResetText}>Hapus Data / Reset</Text>
          </TouchableOpacity>
        )}

        {/* Riwayat Check-In (timeline horizontal) */}
        {history.length > 0 && (
          <View style={styles.historySection}>
            <View style={styles.historySectionHeader}>
              <Text style={styles.cardLabel}>RIWAYAT CHECK-IN</Text>
              <View style={styles.historyCountPill}>
                <Text style={styles.historyCountText}>{history.length}</Text>
              </View>
            </View>
            <FlatList
              data={history}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.historyList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.historyCard}
                  activeOpacity={0.85}
                  onPress={() => setDetailItem(item)}
                >
                  <Image source={{ uri: item.uri }} style={styles.historyThumb} />
                  <Text style={styles.historyDate}>
                    {new Date(item.timestamp).toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* Footer versi aplikasi (Bonus A: expo-constants) */}
        <Text style={styles.versionFooter}>LocaPic · v{APP_VERSION}</Text>
      </ScrollView>
      </LinearGradient>

      {/* Modal About (Bonus A) */}
      <Modal
        visible={aboutVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAboutVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Tentang Aplikasi</Text>
            <Text style={styles.modalAppName}>LocaPic</Text>
            <Text style={styles.modalVersion}>Versi {APP_VERSION}</Text>
            <Text style={styles.modalDesc}>
              LocaPic adalah aplikasi check-in foto dan lokasi, dibangun dengan React Native & Expo
              sebagai portofolio praktikum pengembangan aplikasi mobile.
            </Text>
            <TouchableOpacity
              style={styles.modalReplayBtn}
              onPress={() => {
                setAboutVisible(false);
                setShowOnboarding(true);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.modalReplayBtnText}>🔄 Lihat Lagi Pengenalan App</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setAboutVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCloseBtnText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Modal Detail Riwayat Check-In */}
      <Modal
        visible={!!detailItem}
        animationType="fade"
        transparent
        onRequestClose={() => setDetailItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {detailItem && (
              <>
                <Image source={{ uri: detailItem.uri }} style={styles.detailImage} />
                <Text style={styles.modalTitle}>DETAIL CHECK-IN</Text>
                <Text style={styles.modalAppName}>
                  {new Date(detailItem.timestamp).toLocaleDateString('id-ID', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
                <Text style={styles.modalVersion}>
                  {new Date(detailItem.timestamp).toLocaleTimeString('id-ID')}
                </Text>
                <View style={styles.coordRow}>
                  <Text style={styles.coordLabel}>Latitude</Text>
                  <Text style={styles.coordValue}>{detailItem.latitude.toFixed(6)}</Text>
                </View>
                <View style={styles.coordRow}>
                  <Text style={styles.coordLabel}>Longitude</Text>
                  <Text style={styles.coordValue}>{detailItem.longitude.toFixed(6)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.btnMaps}
                  onPress={() =>
                    Linking.openURL(
                      `https://www.google.com/maps/search/?api=1&query=${detailItem.latitude},${detailItem.longitude}`
                    )
                  }
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnMapsText}>📍 Lihat di Google Maps</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setDetailItem(null)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalCloseBtnText}>Tutup</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Overlay Animasi Perayaan saat Check-In Berhasil */}
      {celebrate && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.celebrateOverlay,
            {
              opacity: celebrateAnim.interpolate({
                inputRange: [0, 0.15, 0.8, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateY: celebrateAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -60],
                  }),
                },
                {
                  scale: celebrateAnim.interpolate({
                    inputRange: [0, 0.2, 1],
                    outputRange: [0.6, 1.15, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.celebrateEmoji}>🎉</Text>
          <Text style={styles.celebrateText}>Check-in berhasil!</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bootScreen: {
    flex: 1,
    backgroundColor: '#4F46E5',
  },
  root: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 28,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerBlobOne: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -50,
    right: -30,
  },
  headerBlobTwo: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.07)',
    bottom: -30,
    left: -20,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  aboutButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  aboutButtonText: {
    fontSize: 15,
  },
  headerEyebrow: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#E0E7FF',
    fontSize: 13,
    marginTop: 4,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  cardLabel: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  imagePreview: {
    width: '100%',
    height: 240,
    borderRadius: 14,
  },
  placeholder: {
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  placeholderIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  placeholderText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 13,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 14,
    backgroundColor: '#F8FAFC',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 7,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 13,
    color: '#64748B',
  },
  coordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    width: '100%',
  },
  coordLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  coordValue: {
    fontSize: 13,
    color: '#1E293B',
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  emptyLocationText: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 19,
  },
  btnMaps: {
    marginTop: 14,
    backgroundColor: '#EEF2FF',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
  },
  btnMapsText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '700',
  },
  btnPrimary: {
    backgroundColor: '#4F46E5',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  btnReset: {
    marginTop: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnResetText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
  },
  versionFooter: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 24,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  modalAppName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E293B',
  },
  modalVersion: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
    marginTop: 4,
    marginBottom: 14,
  },
  modalDesc: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 21,
    marginBottom: 22,
  },
  modalReplayBtn: {
    backgroundColor: '#EEF2FF',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  modalReplayBtnText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '700',
  },
  modalCloseBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 16,
  },
  streakEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C2410C',
  },
  historySection: {
    marginBottom: 8,
  },
  historySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyCountPill: {
    marginLeft: 8,
    backgroundColor: '#EEF2FF',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  historyCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4F46E5',
  },
  historyList: {
    paddingRight: 12,
  },
  historyCard: {
    marginRight: 12,
    alignItems: 'center',
  },
  historyThumb: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
  },
  historyDate: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  detailImage: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    marginBottom: 16,
    backgroundColor: '#E2E8F0',
  },
  celebrateOverlay: {
    position: 'absolute',
    top: '42%',
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    paddingVertical: 18,
    paddingHorizontal: 28,
    borderRadius: 20,
  },
  celebrateEmoji: {
    fontSize: 40,
    marginBottom: 6,
  },
  celebrateText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  onboardRoot: {
    flex: 1,
  },
  skipButton: {
    position: 'absolute',
    top: 56,
    right: 24,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
  },
  skipButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  onboardSlide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  onboardIconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  onboardEmoji: {
    fontSize: 64,
  },
  onboardTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 14,
  },
  onboardDesc: {
    color: '#E0E7FF',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  onboardFooter: {
    paddingHorizontal: 32,
    paddingBottom: 48,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginHorizontal: 4,
  },
  dotActive: {
    width: 22,
    backgroundColor: '#FFFFFF',
  },
  onboardNextBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    width: '100%',
  },
  onboardNextBtnText: {
    color: '#4F46E5',
    fontSize: 15,
    fontWeight: '800',
  },
});