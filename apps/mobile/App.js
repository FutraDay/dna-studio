import React, { useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Feather } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  analyzeBrand,
  loadOverview,
  login,
  logout,
  normalizeServerUrl,
} from "./src/api";

const TOKEN_KEY = "dna-studio-mobile-token";
const SERVER_KEY = "dna-studio-server-url";
const DEFAULT_SERVER = "http://10.0.2.2:3000";

const C = {
  background: "#111111",
  card: "#1A1A1A",
  surface: "#151515",
  border: "#262626",
  foreground: "#ECECEC",
  muted: "#888888",
  accent: "#C9A96E",
  danger: "#F87171",
  success: "#4ADE80",
};
export default function App() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [appError, setAppError] = useState("");

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const [storedToken, storedServer] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(SERVER_KEY),
      ]);

      if (!active) return;
      const server = storedServer || DEFAULT_SERVER;
      setServerUrl(server);

      if (storedToken) {
        setToken(storedToken);
        try {
          const data = await loadOverview(server, storedToken);
          if (active) setOverview(data);
        } catch (error) {
          if (error?.status === 401) {
            await SecureStore.deleteItemAsync(TOKEN_KEY);
            if (active) setToken("");
          } else if (active) {
            setAppError(error.message || "Could not reach DNA Studio.");
          }
        }
      }

      if (active) setBooting(false);
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);
  async function handleLogin(nextServer, email, password) {
    setLoading(true);
    setAppError("");

    try {
      const normalizedServer = normalizeServerUrl(nextServer);
      const result = await login(normalizedServer, email.trim(), password);

      await Promise.all([
        SecureStore.setItemAsync(TOKEN_KEY, result.token),
        SecureStore.setItemAsync(SERVER_KEY, normalizedServer),
      ]);

      setServerUrl(normalizedServer);
      setToken(result.token);
      setOverview(await loadOverview(normalizedServer, result.token));
    } catch (error) {
      setAppError(error.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshOverview() {
    if (!token) return;
    setLoading(true);
    setAppError("");

    try {
      setOverview(await loadOverview(serverUrl, token));
    } catch (error) {
      if (error?.status === 401) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        setToken("");
        setOverview(null);
      } else {
        setAppError(error.message || "Refresh failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);
    await logout(serverUrl, token);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken("");
    setOverview(null);
    setAppError("");
    setLoading(false);
  }
  async function handleAnalyze(url, workspaceId) {
    if (!token) return;
    setLoading(true);
    setAppError("");

    try {
      const normalizedUrl = /^https?:\/\//i.test(url)
        ? url.trim()
        : "https://" + url.trim();

      await analyzeBrand(serverUrl, token, normalizedUrl, workspaceId);
      setOverview(await loadOverview(serverUrl, token));
      return true;
    } catch (error) {
      setAppError(error.message || "Brand analysis failed.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.background} />
        <View style={styles.center}>
          <View style={styles.logoMark}>
            <Feather name="hexagon" size={25} color={C.accent} />
          </View>
          <ActivityIndicator color={C.accent} style={{ marginTop: 18 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (!token) {
    return (
      <LoginScreen
        initialServer={serverUrl}
        loading={loading}
        error={appError}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <HomeScreen
      overview={overview}
      loading={loading}
      error={appError}
      serverUrl={serverUrl}
      onRefresh={refreshOverview}
      onAnalyze={handleAnalyze}
      onLogout={handleLogout}
    />
  );
}
function LoginScreen({ initialServer, loading, error, onLogin }) {
  const [server, setServer] = useState(initialServer);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const ready =
    server.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0 &&
    !loading;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.background} />
      <ScrollView
        contentContainerStyle={styles.loginScroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.loginHero}>
          <View style={styles.logoMarkLarge}>
            <Feather name="hexagon" size={34} color={C.accent} />
          </View>
          <Text style={styles.eyebrow}>DNA STUDIO</Text>
          <Text style={styles.loginTitle}>Your brand system,{"\n"}in your pocket.</Text>
          <Text style={styles.loginSubtitle}>
            Securely connect to your self-hosted DNA Studio.
          </Text>
        </View>

        <View style={styles.card}>
          <Field
            label="DNA Studio server"
            value={server}
            onChangeText={setServer}
            placeholder="http://192.168.1.20:3000"
            autoCapitalize="none"
            keyboardType="url"
          />
          <Text style={styles.fieldHint}>
            Android emulator: http://10.0.2.2:3000. Real phone: use your PC LAN
            address or hosted HTTPS URL.
          </Text>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
          />

          {error ? <ErrorBanner message={error} /> : null}

          <PrimaryButton
            label={loading ? "Connecting…" : "Sign in"}
            icon="arrow-right"
            disabled={!ready}
            onPress={() => onLogin(server, email, password)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
function HomeScreen({
  overview,
  loading,
  error,
  serverUrl,
  onRefresh,
  onAnalyze,
  onLogout,
}) {
  const [brandUrl, setBrandUrl] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");

  const editableWorkspaces = useMemo(
    () =>
      (overview?.workspaces || []).filter(
        (workspace) => workspace.role === "owner" || workspace.role === "admin"
      ),
    [overview]
  );

  useEffect(() => {
    if (!workspaceId && editableWorkspaces.length > 0) {
      setWorkspaceId(editableWorkspaces[0].id);
    }
  }, [editableWorkspaces, workspaceId]);

  async function submitAnalysis() {
    if (!brandUrl.trim()) return;
    const ok = await onAnalyze(brandUrl, workspaceId || undefined);
    if (ok) setBrandUrl("");
  }

  const brands = overview?.brands || [];
  const campaigns = overview?.campaigns || [];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.background} />
      <ScrollView
        contentContainerStyle={styles.homeScroll}
        refreshControl={
          <RefreshControl
            refreshing={loading && Boolean(overview)}
            onRefresh={onRefresh}
            tintColor={C.accent}
          />
        }
      >
        <View style={styles.topbar}>
          <View>
            <Text style={styles.eyebrow}>DNA STUDIO MOBILE</Text>
            <Text style={styles.pageTitle}>
              {overview?.user?.name || "Workspace"}
            </Text>
          </View>
          <Pressable style={styles.iconButton} onPress={onLogout}>
            <Feather name="log-out" size={18} color={C.muted} />
          </Pressable>
        </View>

        <Text style={styles.serverText} numberOfLines={1}>
          <Feather name="server" size={12} color={C.muted} /> {serverUrl}
        </Text>

        {error ? <ErrorBanner message={error} /> : null}

        <View style={styles.statsRow}>
          <Stat label="Brands" value={brands.length} />
          <Stat label="Campaigns" value={campaigns.length} />
          <Stat label="Workspaces" value={overview?.workspaces?.length || 0} />
        </View>
        <View style={[styles.card, styles.analyzeCard]}>
          <View style={styles.sectionHeadingRow}>
            <View style={styles.sectionIcon}>
              <Feather name="aperture" size={17} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Analyze a brand</Text>
              <Text style={styles.sectionSubtitle}>
                Extract Brand DNA from any public website.
              </Text>
            </View>
          </View>

          <TextInput
            value={brandUrl}
            onChangeText={setBrandUrl}
            placeholder="example.com"
            placeholderTextColor="#555"
            autoCapitalize="none"
            keyboardType="url"
            style={styles.input}
          />

          {editableWorkspaces.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.workspaceChips}
            >
              {editableWorkspaces.map((workspace) => (
                <Pressable
                  key={workspace.id}
                  onPress={() => setWorkspaceId(workspace.id)}
                  style={[
                    styles.chip,
                    workspaceId === workspace.id && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      workspaceId === workspace.id && styles.chipTextActive,
                    ]}
                  >
                    {workspace.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <PrimaryButton
            label={loading ? "Analyzing…" : "Analyze website"}
            icon="arrow-right"
            disabled={!brandUrl.trim() || loading}
            onPress={submitAnalysis}
          />
          <Text style={styles.fieldHint}>
            Analysis runs on your DNA Studio server. This app does not contain
            or store provider API keys.
          </Text>
        </View>

        <SectionHeader title="Brands" count={brands.length} />
        {brands.length === 0 ? (
          <EmptyState
            icon="layers"
            title="No brands yet"
            text="Analyze a website above to create your first Brand DNA."
          />
        ) : (
          brands.map((brand) => <BrandCard key={brand.id} brand={brand} />)
        )}
        <SectionHeader title="Recent campaigns" count={campaigns.length} />
        {campaigns.length === 0 ? (
          <EmptyState
            icon="send"
            title="No campaigns yet"
            text="Campaign creation stays in DNA Studio web for now; mobile publishing is intentionally disabled."
          />
        ) : (
          campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))
        )}

        <Text style={styles.safetyNote}>
          Mobile v0.1 is deliberately non-publishing. Scheduling and real social
          publishing remain in the web app where explicit approval is required.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor="#555"
        style={styles.input}
      />
    </View>
  );
}

function PrimaryButton({ label, icon, disabled, onPress }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.primaryButtonDisabled,
        pressed && !disabled && { opacity: 0.86 },
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
      <Feather name={icon} size={16} color="#111" />
    </Pressable>
  );
}
function ErrorBanner({ message }) {
  return (
    <View style={styles.errorBanner}>
      <Feather name="alert-circle" size={15} color={C.danger} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, count }) {
  return (
    <View style={styles.listHeader}>
      <Text style={styles.listTitle}>{title}</Text>
      <Text style={styles.countPill}>{count}</Text>
    </View>
  );
}

function EmptyState({ icon, title, text }) {
  return (
    <View style={styles.emptyCard}>
      <Feather name={icon} size={20} color={C.muted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function BrandCard({ brand }) {
  const colors = (brand.colors || []).slice(0, 4);

  return (
    <View style={styles.entityCard}>
      <View style={styles.entityTopRow}>
        <View style={styles.brandIdentity}>
          <View style={styles.brandMark}>
            <Text style={styles.brandInitial}>
              {(brand.name || "?").slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.entityTitle}>{brand.name}</Text>
            <Text style={styles.entityMeta} numberOfLines={1}>
              {brand.industry || brand.url}
            </Text>
          </View>
        </View>
        <View style={styles.colorRow}>
          {colors.map((color, index) => (
            <View
              key={color + index}
              style={[styles.colorDot, { backgroundColor: color }]}
            />
          ))}
        </View>
      </View>
      <View style={styles.entityFooter}>
        <Text style={styles.tag}>{brand.tone || "Brand DNA"}</Text>
        <Text style={styles.entityMeta}>
          {brand._count?.campaigns || 0} campaigns
        </Text>
      </View>
    </View>
  );
}
function CampaignCard({ campaign }) {
  const accent = campaign.brand?.colors?.[0] || C.accent;

  return (
    <View style={styles.entityCard}>
      <View style={styles.campaignRow}>
        <View style={[styles.campaignLine, { backgroundColor: accent }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.entityTitle}>{campaign.goal}</Text>
          <Text style={styles.entityMeta}>
            {campaign.brand?.name || "Brand"} · {campaign._count?.assets || 0} assets
          </Text>
        </View>
        {campaign.variantLabel ? (
          <Text style={styles.variantPill}>{campaign.variantLabel}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loginScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 42,
  },
  homeScroll: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 44,
  },
  loginHero: { alignItems: "center", marginBottom: 28 },
  logoMark: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  logoMarkLarge: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 20,
  },
  eyebrow: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 7,
  },
  loginTitle: {
    color: C.foreground,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "600",
    textAlign: "center",
    fontStyle: "italic",
  },
  loginSubtitle: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 12,
  },
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 18,
  },
  field: { marginBottom: 17 },
  fieldLabel: {
    color: C.foreground,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  input: {
    minHeight: 48,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    color: C.foreground,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  fieldHint: {
    color: C.muted,
    fontSize: 10.5,
    lineHeight: 16,
    marginTop: 8,
    marginBottom: 17,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 11,
    backgroundColor: C.accent,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: { opacity: 0.42 },
  primaryButtonText: {
    color: "#111",
    fontSize: 13,
    fontWeight: "800",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    marginBottom: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    backgroundColor: "rgba(248,113,113,0.07)",
  },
  errorText: {
    flex: 1,
    color: C.danger,
    fontSize: 11,
    lineHeight: 17,
  },
  topbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  pageTitle: {
    color: C.foreground,
    fontSize: 28,
    fontWeight: "700",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  serverText: {
    color: C.muted,
    fontSize: 10.5,
    marginBottom: 18,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  statValue: {
    color: C.foreground,
    fontSize: 21,
    fontWeight: "800",
  },
  statLabel: {
    color: C.muted,
    fontSize: 10,
    marginTop: 3,
  },
  analyzeCard: { marginBottom: 25 },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 16,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(201,169,110,0.09)",
  },
  sectionTitle: {
    color: C.foreground,
    fontSize: 15,
    fontWeight: "750",
  },
  sectionSubtitle: {
    color: C.muted,
    fontSize: 10.5,
    marginTop: 2,
  },
  workspaceChips: {
    gap: 7,
    paddingVertical: 12,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.surface,
  },
  chipActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(201,169,110,0.09)",
  },
  chipText: { color: C.muted, fontSize: 10.5, fontWeight: "650" },
  chipTextActive: { color: C.accent },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 10,
  },
  listTitle: {
    color: C.foreground,
    fontSize: 17,
    fontWeight: "750",
  },
  countPill: {
    color: C.muted,
    backgroundColor: C.card,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: "hidden",
    fontSize: 10,
  },
  emptyCard: {
    alignItems: "center",
    padding: 26,
    marginBottom: 18,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: "dashed",
  },
  emptyTitle: {
    color: C.foreground,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 10,
  },
  emptyText: {
    color: C.muted,
    fontSize: 10.5,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 5,
  },
  entityCard: {
    padding: 15,
    marginBottom: 9,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  entityTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  brandIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  brandInitial: {
    color: C.accent,
    fontSize: 15,
    fontWeight: "800",
  },
  entityTitle: {
    color: C.foreground,
    fontSize: 13,
    fontWeight: "750",
  },
  entityMeta: {
    color: C.muted,
    fontSize: 10,
    marginTop: 3,
  },
  colorRow: { flexDirection: "row" },
  colorDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    marginLeft: -3,
    borderWidth: 1,
    borderColor: C.card,
  },
  entityFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  tag: {
    color: C.accent,
    fontSize: 9.5,
    fontWeight: "700",
  },
  campaignRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  campaignLine: {
    width: 3,
    height: 35,
    borderRadius: 3,
  },
  variantPill: {
    color: C.accent,
    borderWidth: 1,
    borderColor: "rgba(201,169,110,0.28)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: "800",
  },
  safetyNote: {
    color: C.muted,
    fontSize: 9.5,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 18,
    paddingHorizontal: 18,
  },
});
