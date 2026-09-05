#!/usr/bin/env ruby
# frozen_string_literal: true

require "base64"
require "json"
require "net/http"
require "openssl"
require "uri"

APP_ID = ENV.fetch("APP_STORE_ID", "6799562282")
VERSION = ENV.fetch("MARKETING_VERSION", "1.0")
KEY_ID = ENV.fetch("ASC_KEY_ID")
ISSUER_ID = ENV.fetch("ASC_ISSUER_ID")
KEY_PATH = ENV.fetch("ASC_KEY_PATH")
METADATA_PATH = ENV.fetch("APP_STORE_METADATA_PATH", "app-store/APP_STORE_METADATA.md")

EDITABLE_STATES = %w[
  DEVELOPER_REJECTED
  INVALID_BINARY
  METADATA_REJECTED
  PREPARE_FOR_SUBMISSION
  REJECTED
].freeze

def base64url(value)
  Base64.urlsafe_encode64(value, padding: false)
end

issued_at = Time.now.to_i
header = { alg: "ES256", kid: KEY_ID, typ: "JWT" }
payload = { iss: ISSUER_ID, iat: issued_at, exp: issued_at + 900, aud: "appstoreconnect-v1" }
signing_input = [header, payload].map { |value| base64url(JSON.generate(value)) }.join(".")
private_key = OpenSSL::PKey.read(File.binread(KEY_PATH))
abort "The App Store Connect key is not a private EC key." unless
  private_key.is_a?(OpenSSL::PKey::EC) && private_key.private?
components = OpenSSL::ASN1.decode(
  private_key.sign(OpenSSL::Digest::SHA256.new, signing_input),
).value
abort "Unexpected App Store Connect signature structure." unless components.length == 2
raw_signature = components.map do |component|
  hex = component.value.to_i.to_s(16)
  abort "Unexpected App Store Connect signature component." if hex.length > 64
  [hex.rjust(64, "0")].pack("H*")
end.join
TOKEN = "#{signing_input}.#{base64url(raw_signature)}"

def request_json(method, path, params: {}, body: nil)
  uri = URI("https://api.appstoreconnect.apple.com#{path}")
  uri.query = URI.encode_www_form(params) unless params.empty?
  request_class = { get: Net::HTTP::Get, patch: Net::HTTP::Patch }.fetch(method)
  request = request_class.new(uri)
  request["Authorization"] = "Bearer #{TOKEN}"
  request["Accept"] = "application/json"
  if body
    request["Content-Type"] = "application/json"
    request.body = JSON.generate(body)
  end
  response = Net::HTTP.start(
    uri.host,
    uri.port,
    use_ssl: true,
    open_timeout: 15,
    read_timeout: 45,
  ) { |http| http.request(request) }
  unless response.is_a?(Net::HTTPSuccess)
    detail = begin
      JSON.parse(response.body.to_s).fetch("errors", []).map do |error|
        [error["code"], error["title"], error["detail"]].compact.join(": ")
      end.join(" | ")
    rescue JSON::ParserError
      "Apple returned a non-JSON error."
    end
    abort "App Store Connect #{method.upcase} #{uri.path} failed (HTTP #{response.code}): #{detail.byteslice(0, 900)}"
  end
  return {} if response.body.to_s.strip.empty?
  JSON.parse(response.body)
end

def section(markdown, start_heading, end_heading)
  pattern = /^#{Regexp.escape(start_heading)}\s*$\n(.*?)^#{Regexp.escape(end_heading)}\s*$/m
  match = markdown.match(pattern)
  abort "Metadata section #{start_heading.inspect} was not found." unless match
  match[1]
end

def bold_value(body, label)
  match = body.match(/^\*\*#{Regexp.escape(label)}:\*\*\s*(.+)$/)
  abort "Metadata field #{label.inspect} was not found." unless match
  match[1].strip
end

def description_value(body)
  match = body.match(/^\*\*Description:\*\*\s*\n\n(.*)\z/m)
  abort "Metadata description was not found." unless match
  match[1].strip
end

def validate_listing(locale, listing)
  limits = {
    "name" => 30,
    "subtitle" => 30,
    "promotionalText" => 170,
    "description" => 4_000,
  }
  limits.each do |field, limit|
    value = listing.fetch(field)
    abort "#{locale} #{field} exceeds #{limit} characters." if value.length > limit
  end
  keyword_bytes = listing.fetch("keywords").bytesize
  abort "#{locale} keywords exceed Apple's 100-byte limit." if keyword_bytes > 100
  abort "#{locale} keywords contain an empty entry." if listing.fetch("keywords").split(",").any?(&:empty?)
  abort "#{locale} description must disclose independence." unless
    listing.fetch("description").include?(locale == "es-MX" ? "aplicación independiente" : "independent app")
end

markdown = File.read(METADATA_PATH, encoding: "UTF-8")
english = section(markdown, "## English (United States)", "## Spanish (Mexico App Store locale; Puerto Rico copy)")
spanish = section(markdown, "## Spanish (Mexico App Store locale; Puerto Rico copy)", "## In-app purchase localization")

listings = {
  "en-US" => {
    "name" => bold_value(english, "Name"),
    "subtitle" => bold_value(english, "Subtitle"),
    "promotionalText" => bold_value(english, "Promotional text"),
    "keywords" => bold_value(english, "Keywords"),
    "description" => description_value(english),
    "marketingUrl" => "https://lrodeveloperr.github.io/grocery-benefits-tracker/",
    "supportUrl" => "https://lrodeveloperr.github.io/grocery-benefits-tracker/support/",
    "privacyPolicyUrl" => "https://lrodeveloperr.github.io/grocery-benefits-tracker/privacy/",
    "privacyChoicesUrl" => "https://lrodeveloperr.github.io/grocery-benefits-tracker/privacy/",
  },
  "es-MX" => {
    "name" => bold_value(spanish, "Name"),
    "subtitle" => bold_value(spanish, "Subtitle"),
    "promotionalText" => bold_value(spanish, "Promotional text"),
    "keywords" => bold_value(spanish, "Keywords"),
    "description" => description_value(spanish),
    "marketingUrl" => "https://lrodeveloperr.github.io/grocery-benefits-tracker/es/",
    "supportUrl" => "https://lrodeveloperr.github.io/grocery-benefits-tracker/es/soporte/",
    "privacyPolicyUrl" => "https://lrodeveloperr.github.io/grocery-benefits-tracker/es/privacidad/",
    "privacyChoicesUrl" => "https://lrodeveloperr.github.io/grocery-benefits-tracker/es/privacidad/",
  },
}
listings.each { |locale, listing| validate_listing(locale, listing) }

versions = request_json(
  :get,
  "/v1/apps/#{APP_ID}/appStoreVersions",
  params: { "filter[platform]" => "IOS", "filter[versionString]" => VERSION, "limit" => "5" },
).fetch("data", [])
abort "Expected exactly one iOS App Store version #{VERSION}; found #{versions.length}." unless versions.length == 1
version = versions.first
state = version.dig("attributes", "appStoreState")
abort "iOS version #{VERSION} is not editable (state #{state})." unless EDITABLE_STATES.include?(state)

version_localizations = request_json(
  :get,
  "/v1/appStoreVersions/#{version.fetch("id")}/appStoreVersionLocalizations",
  params: { "limit" => "50" },
).fetch("data", []).to_h { |row| [row.dig("attributes", "locale"), row] }

app_infos = request_json(
  :get,
  "/v1/apps/#{APP_ID}/appInfos",
  params: { "limit" => "10" },
).fetch("data", [])
app_info = app_infos.find { |row| row.dig("attributes", "appStoreState") == state } ||
  app_infos.find { |row| EDITABLE_STATES.include?(row.dig("attributes", "appStoreState")) }
abort "No editable iOS app-info record was found." unless app_info
app_info_localizations = request_json(
  :get,
  "/v1/appInfos/#{app_info.fetch("id")}/appInfoLocalizations",
  params: { "limit" => "50" },
).fetch("data", []).to_h { |row| [row.dig("attributes", "locale"), row] }

listings.each do |locale, listing|
  version_row = version_localizations.fetch(locale) do
    abort "The existing #{locale} version localization was not found."
  end
  version_attributes = listing.slice(
    "description",
    "keywords",
    "marketingUrl",
    "promotionalText",
    "supportUrl",
  )
  unless version_attributes.all? { |key, value| version_row.dig("attributes", key) == value }
    request_json(
      :patch,
      "/v1/appStoreVersionLocalizations/#{version_row.fetch("id")}",
      body: {
        data: {
          type: "appStoreVersionLocalizations",
          id: version_row.fetch("id"),
          attributes: version_attributes,
        },
      },
    )
  end

  info_row = app_info_localizations.fetch(locale) do
    abort "The existing #{locale} app-info localization was not found."
  end
  info_attributes = listing.slice(
    "name",
    "subtitle",
    "privacyPolicyUrl",
    "privacyChoicesUrl",
  )
  unless info_attributes.all? { |key, value| info_row.dig("attributes", key) == value }
    request_json(
      :patch,
      "/v1/appInfoLocalizations/#{info_row.fetch("id")}",
      body: {
        data: {
          type: "appInfoLocalizations",
          id: info_row.fetch("id"),
          attributes: info_attributes,
        },
      },
    )
  end
end

listings.each do |locale, listing|
  version_id = version_localizations.fetch(locale).fetch("id")
  actual_version = request_json(
    :get,
    "/v1/appStoreVersionLocalizations/#{version_id}",
  ).fetch("data").fetch("attributes")
  listing.slice("description", "keywords", "marketingUrl", "promotionalText", "supportUrl").each do |key, expected|
    abort "#{locale} #{key} verification failed." unless actual_version[key] == expected
  end

  info_id = app_info_localizations.fetch(locale).fetch("id")
  actual_info = request_json(
    :get,
    "/v1/appInfoLocalizations/#{info_id}",
  ).fetch("data").fetch("attributes")
  listing.slice("name", "subtitle", "privacyPolicyUrl", "privacyChoicesUrl").each do |key, expected|
    abort "#{locale} #{key} verification failed." unless actual_info[key] == expected
  end
  puts "Verified #{locale} App Store listing for iOS #{VERSION}."
end

puts "App Store listing finalization completed in state #{state}."
