import React, { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

type BarcodeType = "ean13" | "ean8" | "upc_a" | "upc_e";
type BarcodeScanningResult = {
  data: string;
  type: string;
};

type Props = {
  barcodeTypes: BarcodeType[];
  onBarcodeScanned: (result: BarcodeScanningResult) => void;
  onMountError: (error: { message: string }) => void;
  onPermissionDenied: () => void;
  onPermissionError: (error: unknown) => void;
  preparingText: string;
};

export default function BarcodeScannerCamera({
  onMountError,
  preparingText,
}: Props) {
  const reportedUnavailable = useRef(false);

  useEffect(() => {
    if (reportedUnavailable.current) return;
    reportedUnavailable.current = true;
    onMountError({
      message:
        "Camera scanning is temporarily unavailable in this recovery build.",
    });
  }, [onMountError]);

  return (
    <View style={styles.loading}>
      <ActivityIndicator color="#ffffff" size="large" />
      <Text style={styles.loadingText}>{preparingText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    backgroundColor: "#0b0b0c",
    justifyContent: "center",
  },
  loadingText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 14,
  },
});
