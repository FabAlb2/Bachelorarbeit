package com.whs.bachelorarbeit.controller;


import com.whs.bachelorarbeit.dto.FacilityDTO;
import com.whs.bachelorarbeit.service.FacilityService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/facilities")
public class FacilityController {

    private final FacilityService facilityService;

    public FacilityController(FacilityService facilityService) {
        this.facilityService = facilityService;
    }

    @GetMapping
    public List<FacilityDTO> getAll() {
        return facilityService.getAll();
    }

    // GET /api/facilities/{id}
    @GetMapping("/{id}")
    public FacilityDTO getById(@PathVariable Long id) {
        return facilityService.getById(id);
    }


}
