package com.whs.bachelorarbeit.controller;

import com.whs.bachelorarbeit.dto.DistrictUnemploymentDTO;
import com.whs.bachelorarbeit.service.DistrictUnemploymentService;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;


@RestController
@RequestMapping("/api/district-unemployment")
public class DistrictUnemploymentController {


    private final DistrictUnemploymentService service;

    public DistrictUnemploymentController(DistrictUnemploymentService service) {
        this.service = service;
    }

    @GetMapping("/stichtage")
    public List<LocalDate> stichtage() {
        return service.getLatestStichtage(5);
    }

    @GetMapping(params = "stichtag")
    public List<DistrictUnemploymentDTO> byDate(@RequestParam LocalDate stichtag) {
        return service.getByStichtag(stichtag);
    }

}
