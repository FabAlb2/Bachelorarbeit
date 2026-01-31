package com.whs.bachelorarbeit.controller;

import com.whs.bachelorarbeit.dto.DoctorListItemDTO;
import com.whs.bachelorarbeit.service.DoctorService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/doctors")
public class DoctorController {

    public final DoctorService doctorService;

    public DoctorController(DoctorService doctorService) {
        this.doctorService = doctorService;
    }

    //GET /api/doctors
    @GetMapping
    public List<DoctorListItemDTO> getAll() {
        return doctorService.getAll();
    }

    //GET /api/doctors/{id}
    @GetMapping("/{id}")
    public DoctorListItemDTO getById(@PathVariable long id) {
        return doctorService.getById(id);
    }

}
