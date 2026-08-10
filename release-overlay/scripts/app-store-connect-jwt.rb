#!/usr/bin/env ruby
# frozen_string_literal: true

require "base64"
require "json"
require "openssl"

key_path, key_id, issuer_id = ARGV
abort "Usage: app-store-connect-jwt.rb KEY_PATH KEY_ID ISSUER_ID" if
  [key_path, key_id, issuer_id].any? { |value| value.nil? || value.empty? }

def base64url(value)
  Base64.urlsafe_encode64(value, padding: false)
end

issued_at = Time.now.to_i
header = { alg: "ES256", kid: key_id, typ: "JWT" }
payload = {
  iss: issuer_id,
  iat: issued_at,
  exp: issued_at + 900,
  aud: "appstoreconnect-v1",
}

signing_input = [header, payload]
  .map { |value| base64url(JSON.generate(value)) }
  .join(".")

private_key = OpenSSL::PKey.read(File.binread(key_path))
abort "The supplied App Store Connect key is not an EC private key." unless
  private_key.is_a?(OpenSSL::PKey::EC) && private_key.private?

der_signature = private_key.sign(OpenSSL::Digest::SHA256.new, signing_input)
components = OpenSSL::ASN1.decode(der_signature).value
abort "Unexpected ECDSA signature structure." unless components.length == 2

raw_signature = components.map do |component|
  hex = component.value.to_i.to_s(16)
  abort "Unexpected ECDSA signature component length." if hex.length > 64
  [hex.rjust(64, "0")].pack("H*")
end.join

puts "#{signing_input}.#{base64url(raw_signature)}"
