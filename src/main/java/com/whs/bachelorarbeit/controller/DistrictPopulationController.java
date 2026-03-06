package com.whs.bachelorarbeit.controller;

import com.whs.bachelorarbeit.dto.DistrictPopulationDTO;
import com.whs.bachelorarbeit.service.DistrictPopulationService;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/district-population")
public class DistrictPopulationController {

    private final DistrictPopulationService service;

    public DistrictPopulationController(DistrictPopulationService service) {
        this.service = service;
    }

    // Dropdown: immer die letzten 5 Stichtage
    @GetMapping("/stichtage")
    public List<LocalDate> stichtage() {
        return service.getLatestStichtage(5);
    }

    // Daten: alle Stadtteile für gewählten Stichtag
    // GET /api/district-population?stichtag=2025-12-31
    @GetMapping
    public List<DistrictPopulationDTO> byDate(@RequestParam LocalDate stichtag) {
        return service.getByStichtag(stichtag);
    }
}
