//package com.whs.bachelorarbeit.importer;
//
//import com.whs.bachelorarbeit.entity.Facility;
//import com.whs.bachelorarbeit.repository.FacilityRepository;
//import org.springframework.core.io.ClassPathResource;
//import org.springframework.stereotype.Service;
//import org.springframework.transaction.annotation.Transactional;
//
//import java.io.BufferedReader;
//import java.io.InputStreamReader;
//import java.nio.charset.StandardCharsets;
//
//@Service
//public class FacilityImportService {
//
//    private final FacilityRepository facilityRepository;
//
//    public FacilityImportService(FacilityRepository facilityRepository) {
//        this.facilityRepository = facilityRepository;
//    }
//
//    @Transactional
//    public int resetAndImportFromCsv() {
//        // 1) alles löschen
//        facilityRepository.deleteAllInBatch();
//
//        // 2) CSV neu importieren
//        int imported = 0;
//
//        try (BufferedReader reader = new BufferedReader(
//                new InputStreamReader(new ClassPathResource("import/facilities.csv").getInputStream(),
//                        StandardCharsets.UTF_8))) {
//
//            String line = reader.readLine(); // Header
//            if (line == null) return 0;

//            while ((line = reader.readLine()) != null) {
//                String[] parts = line.split(",", -1);
//                if (parts.length < 5) continue;
//
//                Facility f = new Facility();
//                f.setName(parts[0].trim());
//                f.setType(parts[1].trim());
//                f.setLatitude(parseDouble(parts[2]));
//                f.setLongitude(parseDouble(parts[3]));
//                f.setWheelchairAccessible(parseBoolean(parts[4]));
//
//                facilityRepository.save(f);
//                imported++;
//            }
//        } catch (Exception e) {
//            throw new RuntimeException("CSV Import fehlgeschlagen: " + e.getMessage(), e);
//        }
//
//        return imported;
//    }
//
//    private Double parseDouble(String s) {
//        s = s == null ? "" : s.trim();
//        if (s.isEmpty()) return null;
//        return Double.parseDouble(s);
//    }
//
//    private Boolean parseBoolean(String s) {
//        s = s == null ? "" : s.trim().toLowerCase();
//        if (s.isEmpty()) return null;
//        return s.equals("true") || s.equals("1") || s.equals("yes");
//    }
//}
