//package com.whs.bachelorarbeit.importer;
//
//import org.springframework.boot.CommandLineRunner;
//import org.springframework.stereotype.Component;
//
//@Component
//public class ImportOnStartup implements CommandLineRunner {
//
//    private final FacilityImportService importService;
//
//    public ImportOnStartup(FacilityImportService importService) {
//        this.importService = importService;
//    }
//
//    @Override
//    public void run(String... args) {
//        int imported = importService.resetAndImportFromCsv();
//        System.out.println("✅ CSV Reset-Import abgeschlossen. Importiert: " + imported);
//    }
//}
