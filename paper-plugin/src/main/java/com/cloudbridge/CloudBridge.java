package com.cloudbridge;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.server.ServerListPingEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;

public final class CloudBridge extends JavaPlugin implements Listener {
    private final Gson gson = new Gson();
    private final AtomicReference<JsonObject> features = new AtomicReference<>(new JsonObject());
    private HttpClient http;
    private String baseUrl;
    private String bridgeToken;
    private volatile String lastSync = "Henüz eşitlenmedi";
    private volatile String lastError = "";

    @Override public void onEnable() {
        saveDefaultConfig();
        baseUrl = getConfig().getString("api-url", "https://YOUR-SERVICE.onrender.com").replaceAll("/+$", "");
        bridgeToken = getConfig().getString("bridge-token", "CHANGE_ME").trim();
        http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NORMAL).build();
        Bukkit.getPluginManager().registerEvents(this, this);
        if (getCommand("cloud") != null) getCommand("cloud").setExecutor(this);
        Bukkit.getScheduler().runTaskAsynchronously(this, this::syncFeatures);
        Bukkit.getScheduler().runTaskTimerAsynchronously(this, this::syncFeatures, 20L * 30, 20L * 30);
        getLogger().info("CloudBridge açıldı. API: " + baseUrl);
        getLogger().warning("Bulut kataloğundaki JAR dosyaları çalıştırılmaz; yalnızca desteklenen CloudBridge özellikleri eşitlenir.");
    }

    private HttpRequest.Builder request(String url) {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(20));
        if (!bridgeToken.isBlank() && !bridgeToken.equals("CHANGE_ME")) b.header("X-Bridge-Token", bridgeToken);
        return b;
    }
    private String getText(String path) throws Exception {
        HttpResponse<String> r = http.send(request(baseUrl + path).GET().build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (r.statusCode() != 200) throw new IOException("API HTTP " + r.statusCode());
        return r.body();
    }
    private void syncFeatures() {
        try {
            if (bridgeToken.isBlank() || bridgeToken.equals("CHANGE_ME")) throw new IOException("config.yml içindeki bridge-token ayarlanmalı.");
            JsonObject response = gson.fromJson(getText("/api/bridge/config"), JsonObject.class);
            JsonObject next = response.has("features") && response.get("features").isJsonObject() ? response.getAsJsonObject("features") : new JsonObject();
            features.set(next);
            lastSync = java.time.Instant.now().toString(); lastError = "";
        } catch (Exception e) {
            lastError = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            getLogger().fine("Cloud sync başarısız: " + lastError);
        }
    }
    private JsonObject feature(String key) {
        JsonObject root = features.get();
        return root.has(key) && root.get(key).isJsonObject() ? root.getAsJsonObject(key) : new JsonObject();
    }
    private boolean enabled(JsonObject f) { return f.has("enabled") && f.get("enabled").getAsBoolean(); }
    private String value(JsonObject f, String key, String fallback) { return f.has(key) && !f.get(key).isJsonNull() ? f.get(key).getAsString() : fallback; }
    private String format(String raw, String player) { return ChatColor.translateAlternateColorCodes('&', raw.replace("{player}", player)); }

    @EventHandler public void onJoin(PlayerJoinEvent event) {
        String player = event.getPlayer().getName();
        JsonObject msg = feature("joinMessage");
        if (enabled(msg)) event.getPlayer().sendMessage(format(value(msg, "message", "&aWelcome, {player}!"), player));
        JsonObject broadcast = feature("joinBroadcast");
        if (enabled(broadcast)) Bukkit.broadcastMessage(format(value(broadcast, "message", "&e{player} joined."), player));
        JsonObject title = feature("welcomeTitle");
        if (enabled(title)) event.getPlayer().sendTitle(format(value(title, "title", "&bWelcome!"), player), format(value(title, "subtitle", "&7Enjoy your stay, {player}."), player), 10, 60, 20);
    }
    @EventHandler public void onPing(ServerListPingEvent event) {
        JsonObject motd = feature("serverListMotd");
        if (enabled(motd)) event.setMotd(format(value(motd, "message", "&bCloudBridge"), ""));
    }

    @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0 || args[0].equalsIgnoreCase("help")) {
            sender.sendMessage("§bCloudBridge §7komutları:");
            sender.sendMessage("§f/cloud status §7- bulut bağlantı durumu");
            sender.sendMessage("§f/cloud sync §7- özellikleri hemen eşitle (admin)");
            sender.sendMessage("§f/cloud plugins §7- bulutta saklanan JAR kataloğu");
            sender.sendMessage("§f/cloud worlds §7- bulut dünya arşivi kataloğu");
            sender.sendMessage("§7Not: Katalog JAR'ları uzaktan çalıştırılmaz.");
            return true;
        }
        if (args[0].equalsIgnoreCase("status")) {
            sender.sendMessage("§bCloudBridge §7- Son eşitleme: §f" + lastSync);
            sender.sendMessage(lastError.isBlank() ? "§aSon API isteğinde hata yok." : "§cSon hata: " + lastError);
            sender.sendMessage("§7Bulut dosyaları: saklanır/listelenir; otomatik yüklenmez.");
            return true;
        }
        if (args[0].equalsIgnoreCase("sync")) {
            if (!sender.hasPermission("cloudbridge.admin")) { sender.sendMessage("§cBu komut için yetkin yok."); return true; }
            sender.sendMessage("§7Bulut özellikleri eşitleniyor...");
            Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
                syncFeatures();
                Bukkit.getScheduler().runTask(this, () -> sender.sendMessage(lastError.isBlank() ? "§aCloudBridge eşitlendi." : "§cEşitleme başarısız: " + lastError));
            });
            return true;
        }
        if (args[0].equalsIgnoreCase("plugins") || args[0].equalsIgnoreCase("worlds")) {
            String type = args[0].equalsIgnoreCase("plugins") ? "plugins" : "worlds";
            Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
                try {
                    JsonObject response = gson.fromJson(getText("/api/files?type=" + type), JsonObject.class);
                    List<String> names = new ArrayList<>();
                    if (response.has(type) && response.get(type).isJsonArray()) response.getAsJsonArray(type).forEach(x -> { if (x.isJsonObject() && x.getAsJsonObject().has("name")) names.add(x.getAsJsonObject().get("name").getAsString()); });
                    Bukkit.getScheduler().runTask(this, () -> {
                        sender.sendMessage("§bCloudBridge §7- buluttaki " + type + " (" + names.size() + ")");
                        if (names.isEmpty()) sender.sendMessage("§7Henüz dosya yok."); else names.forEach(n -> sender.sendMessage("§f- §a" + n));
                        if (type.equals("plugins")) sender.sendMessage("§eBunlar katalog dosyalarıdır; CloudBridge bunları çalıştırmaz.");
                    });
                } catch (Exception e) { Bukkit.getScheduler().runTask(this, () -> sender.sendMessage("§cBulut bağlantı hatası: " + e.getMessage())); }
            }); return true;
        }
        sender.sendMessage("§cBilinmeyen komut. /cloud help"); return true;
    }
}
